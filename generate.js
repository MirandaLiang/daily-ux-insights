const fs = require("fs");
const https = require("https");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";

// ── Generic HTTPS GET ──────────────────────────────────────────────────────────
function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse failed: " + data.slice(0, 200))); }
      });
    }).on("error", reject);
  });
}

// ── Call Gemini API ────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  });

  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error("Gemini API error: " + JSON.stringify(json.error)));
            return;
          }
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (!text) {
            reject(new Error("Gemini returned empty text. Full response: " + data));
            return;
          }
          resolve(text.trim());
        } catch (e) {
          reject(new Error("Failed to parse Gemini response: " + data));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Fetch today's story from Gemini ───────────────────────────────────────────
async function fetchNewsStory() {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `Today is ${today}. You are an editor for a bilingual daily newsletter called Daily UX Insights for Staff Designers. Write ONE compelling insight about AI or UX design trends.

Return ONLY valid JSON, no markdown, no code fences, no explanation. Just the raw JSON object:
{"tag":"AI DESIGN","title_en":"Short headline max 10 words","body_en":"2-3 sentences about the insight and why it matters to designers.","pull_quote":"One memorable quote or insight in 1-2 sentences.","body_en_extra":"1-2 sentences on implications for designers.","title_zh":"Chinese headline","body_zh":"Chinese translation of body content for design professionals."}`;

  const raw = await callGemini(prompt);
  const clean = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error("Could not parse JSON from Gemini. Response was:\n" + raw);
  }
}

// ── Format date ───────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
  });
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Build archive cards HTML ───────────────────────────────────────────────────
function buildArchiveCards(pastStories) {
  if (!pastStories || pastStories.length === 0) return "";

  const cards = pastStories.map(entry => `
    <div class="archive-card">
      <div class="archive-card-meta">
        <span class="archive-tag">${escapeHtml(entry.story.tag || "AI DESIGN")}</span>
        <span class="archive-date">${formatDate(entry.date)}</span>
      </div>
      <h3 class="archive-title">${escapeHtml(entry.story.title_en)}</h3>
      <p class="archive-body">${escapeHtml(entry.story.body_en)}</p>
      <div class="archive-title-zh">${escapeHtml(entry.story.title_zh)}</div>
    </div>
  `).join("\n");

  return `
    <section class="archive-section">
      <div class="archive-header">
        <span class="archive-header-label">Previous Issues</span>
        <div class="archive-header-rule"></div>
      </div>
      <div class="archive-grid">
        ${cards}
      </div>
    </section>
  `;
}

// ── Build full HTML ────────────────────────────────────────────────────────────
function buildHTML(story, pastStories) {
  let html = fs.readFileSync("newsletter.template.html", "utf8");
  const today = new Date().toISOString().split("T")[0];

  html = html.replace(/March 15, 2026/g, formatDate(today));
  html = html.replace(/AI DESIGN/g, escapeHtml(story.tag || "AI DESIGN"));

  const words = escapeHtml(story.title_en).split(" ");
  const lastWord = words.pop();
  const headline = words.join(" ") + (words.length ? " " : "") + `<em>${lastWord}</em>`;
  html = html.replace(
    /The Shift from Deterministic<br>to <em>Probabilistic<\/em> UI/,
    headline
  );

  html = html.replace(
    /As generative AI becomes integrated into core products.*?dynamic generation\./,
    escapeHtml(story.body_en)
  );

  html = html.replace(
    /"The interface is no longer a fixed stage.*?"/,
    `"${escapeHtml(story.pull_quote)}"`
  );

  html = html.replace(
    /This shift demands new mental models:.*?than dictating it\./,
    escapeHtml(story.body_en_extra)
  );

  html = html.replace(
    /从确定性 UI 向概率性 UI 的转变/,
    escapeHtml(story.title_zh)
  );

  html = html.replace(
    /随着生成式 AI 集成到核心产品中.*?布局系统。/,
    escapeHtml(story.body_zh)
  );

  // Inject archive styles + section before </body>
  const archiveStyles = `
  <style>
    .archive-section {
      margin-top: 64px;
      animation: fadeUp 0.9s ease 0.4s both;
    }
    .archive-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 28px;
    }
    .archive-header-label {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: var(--muted);
      white-space: nowrap;
    }
    .archive-header-rule {
      flex: 1;
      height: 1px;
      background: var(--rule);
    }
    .archive-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }
    .archive-card {
      border: 1px solid var(--rule);
      padding: 20px;
      background: var(--paper);
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .archive-card:hover {
      border-color: var(--accent);
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .archive-card-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .archive-tag {
      background: var(--accent);
      color: #fff;
      font-family: 'DM Mono', monospace;
      font-size: 8px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 2px;
    }
    .archive-date {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      color: var(--muted);
    }
    .archive-title {
      font-family: 'Playfair Display', serif;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 8px;
      color: var(--ink);
    }
    .archive-body {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      line-height: 1.7;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .archive-title-zh {
      font-family: 'Noto Serif SC', serif;
      font-size: 11px;
      color: var(--muted);
      border-top: 1px dashed var(--rule);
      padding-top: 10px;
    }
  </style>`;

  const archiveHTML = buildArchiveCards(pastStories);
  html = html.replace("</body>", archiveStyles + "\n" + archiveHTML + "\n</body>");

  return html;
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  const today = new Date().toISOString().split("T")[0];

  // Load existing archive
  let archive = [];
  if (fs.existsSync("archive.json")) {
    archive = JSON.parse(fs.readFileSync("archive.json", "utf8"));
  }

  // Check if today's story already exists
  const alreadyToday = archive.find(e => e.date === today);
  let todayStory;

  if (alreadyToday) {
    console.log("Today's story already in archive, reusing it.");
    todayStory = alreadyToday.story;
    archive = archive.filter(e => e.date !== today); // will re-add at top
  } else {
    console.log("Fetching today's story from Gemini...");
    todayStory = await fetchNewsStory();
    console.log("Story fetched:", todayStory.title_en);
  }

  // Add today to top of archive
  archive.unshift({ date: today, story: todayStory });

  // Keep last 30 days only
  archive = archive.slice(0, 30);

  // Save archive
  fs.writeFileSync("archive.json", JSON.stringify(archive, null, 2), "utf8");
  console.log(`Archive updated: ${archive.length} stories stored.`);

  // Past stories = everything except today
  const pastStories = archive.slice(1);

  // Build and write HTML
  const html = buildHTML(todayStory, pastStories);
  fs.writeFileSync("index.html", html, "utf8");
  console.log("index.html written successfully!");
})();
