const fs = require("fs");
const https = require("https");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── 1. Call Gemini API (基础网络请求) ───────────────────────────────────────
async function callGemini(prompt) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
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

// ── 2. Retry Logic (自动重试包装器) ──────────────────────────────────────────
async function fetchWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 尝试调用基础的 callGemini 函数
      return await callGemini(prompt);
    } catch (error) {
      console.warn(`[Warning] Attempt ${attempt} failed: ${error.message}`);
      if (attempt === maxRetries) {
        throw new Error(`All ${maxRetries} attempts failed. Last error: ${error.message}`);
      }
      // 遇到高峰期，等待时间递增：5秒, 10秒...
      const waitTime = attempt * 5000; 
      console.log(`Waiting ${waitTime / 1000} seconds before retrying...`);
      await sleep(waitTime);
    }
  }
}

// ── 3. Fetch 10 stories (业务逻辑) ───────────────────────────────────────────
async function fetchTenStories() {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `Today is ${today}. You are an editor for a bilingual daily newsletter called Daily UX Insights for Staff Designers.

Write exactly 10 different compelling insights about AI and UX design trends. Each story must cover a DIFFERENT topic.

Return ONLY a valid JSON array with exactly 10 objects. No markdown, no code fences, no explanation. Just the raw JSON array:
[
  {
    "tag": "AI DESIGN",
    "title_en": "Short punchy headline max 10 words",
    "body_en": "2-3 sentences about the insight and why it matters to designers.",
    "pull_quote": "One memorable quote or insight in 1-2 sentences.",
    "body_en_extra": "1-2 sentences on implications for designers.",
    "title_zh": "Chinese headline",
    "body_zh": "Chinese translation of body content for design professionals."
  }
]

Topics to cover across the 10 stories (one each): generative UI patterns, AI-assisted design tools, voice and multimodal interfaces, design systems for AI products, ethical AI design, spatial computing UX, motion and animation trends, accessibility in AI, design leadership in AI era, emerging UX research methods.`;

  // 这里使用带有重试机制的函数
  const raw = await fetchWithRetry(prompt);
  const clean = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const stories = JSON.parse(clean);
    if (!Array.isArray(stories) || stories.length === 0) {
      throw new Error("Expected an array of stories");
    }
    return stories.slice(0, 10);
  } catch (e) {
    throw new Error("Could not parse JSON array from Gemini. Response was:\n" + raw);
  }
}

// ── 4. Format date ────────────────────────────────────────────────────────────
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

// ── 5. Build a single full article card ───────────────────────────────────────
function buildArticleCard(story, isFirst) {
  const words = escapeHtml(story.title_en).split(" ");
  const lastWord = words.pop();
  const headline = words.join(" ") + (words.length ? " " : "") + `<em>${lastWord}</em>`;

  return `
    <article class="article${isFirst ? " article--first" : ""}">
      <div class="article-meta">
        <span class="tag">${escapeHtml(story.tag || "AI DESIGN")}</span>
        <div class="meta-rule"></div>
      </div>
      <div class="en-block">
        <h2>${headline}</h2>
        <p class="en-body">${escapeHtml(story.body_en)}</p>
        <div class="pull-quote">${escapeHtml(story.pull_quote)}</div>
        <p class="en-body">${escapeHtml(story.body_en_extra)}</p>
      </div>
      <div class="cn-block">
        <div class="cn-label">Chinese · 中文版</div>
        <h2>${escapeHtml(story.title_zh)}</h2>
        <p class="cn-body">${escapeHtml(story.body_zh)}</p>
      </div>
    </article>
    <div class="ornamental-rule">· · · ✦ · · ·</div>`;
}

// ── 6. Build archive cards HTML ────────────────────────────────────────────────
function buildArchiveCards(pastDays) {
  if (!pastDays || pastDays.length === 0) return "";

  const cards = pastDays.map(entry => {
    const firstStory = Array.isArray(entry.stories) ? entry.stories[0] : entry.story;
    const count = Array.isArray(entry.stories) ? entry.stories.length : 1;
    return `
    <div class="archive-card">
      <div class="archive-card-meta">
        <span class="archive-tag">${escapeHtml(firstStory.tag || "AI DESIGN")}</span>
        <span class="archive-date">${formatDate(entry.date)}</span>
      </div>
      <h3 class="archive-title">${escapeHtml(firstStory.title_en)}</h3>
      <p class="archive-body">${escapeHtml(firstStory.body_en)}</p>
      <div class="archive-footer">
        <span class="archive-count">+${count - 1} more stories this day</span>
        <div class="archive-title-zh">${escapeHtml(firstStory.title_zh)}</div>
      </div>
    </div>`;
  }).join("\n");

  return `
    <section class="archive-section">
      <div class="archive-header">
        <span class="archive-header-label">Previous Issues</span>
        <div class="archive-header-rule"></div>
      </div>
      <div class="archive-grid">${cards}</div>
    </section>`;
}

// ── 7. Build full HTML ─────────────────────────────────────────────────────────
function buildHTML(stories, pastDays) {
  let html = fs.readFileSync("newsletter.template.html", "utf8");
  const today = new Date().toISOString().split("T")[0];

  // Update date
  html = html.replace(/\w+ \d+, \d{4} · Issue \d+/g, formatDate(today) + ' · Issue 047');

  // Replace the single article block with all 10 articles
  const allArticles = stories.map((story, i) => buildArticleCard(story, i === 0)).join("\n");

  html = html.replace(
    "",
    allArticles
  );

  // Archive styles + section
  const archiveStyles = `
  <style>
    .archive-section { margin-top: 64px; animation: fadeUp 0.9s ease 0.4s both; }
    .archive-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
    .archive-header-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
    .archive-header-rule { flex: 1; height: 1px; background: var(--rule); }
    .archive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .archive-card { border: 1px solid var(--rule); padding: 20px; background: var(--paper); transition: border-color 0.2s, box-shadow 0.2s; }
    .archive-card:hover { border-color: var(--accent); box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
    .archive-card-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .archive-tag { background: var(--accent); color: #fff; font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 0.2em; text-transform: uppercase; padding: 2px 7px; border-radius: 2px; }
    .archive-date { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); }
    .archive-title { font-family:
