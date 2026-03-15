const fs = require("fs");
const https = require("https");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.0-flash";

// ── Call Gemini API ────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
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
        console.log("Gemini raw response:", data); // Log full response for debugging
        try {
          const json = JSON.parse(data);

          // Check for API errors
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

// ── Fetch today's news story from Gemini ──────────────────────────────────────
async function fetchNewsStory() {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `Today is ${today}. You are an editor for a bilingual daily newsletter called Daily UX Insights for Staff Designers. Write ONE compelling insight about AI or UX design trends.

Return ONLY valid JSON, no markdown, no code fences, no explanation. Just the raw JSON object:
{"tag":"AI DESIGN","title_en":"Short headline max 10 words","body_en":"2-3 sentences about the insight and why it matters to designers.","pull_quote":"One memorable quote or insight in 1-2 sentences.","body_en_extra":"1-2 sentences on implications for designers.","title_zh":"Chinese headline","body_zh":"Chinese translation of body content for design professionals."}`;

  const raw = await callGemini(prompt);
  console.log("Gemini text response:", raw);

  // Strip any accidental markdown code fences
  const clean = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error("Could not parse JSON from Gemini. Response was:\n" + raw);
  }
}

// ── Format date ───────────────────────────────────────────────────────────────
function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

// ── Inject into HTML template ─────────────────────────────────────────────────
function buildHTML(story) {
  let html = fs.readFileSync("newsletter.template.html", "utf8");

  html = html.replace(/March 15, 2026/g, formatDate());
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

  return html;
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  console.log("API Key present:", !!GEMINI_API_KEY);
  console.log("API Key prefix:", GEMINI_API_KEY ? GEMINI_API_KEY.slice(0, 6) + "..." : "MISSING");

  const story = await fetchNewsStory();
  console.log("Story title:", story.title_en);

  const html = buildHTML(story);
  fs.writeFileSync("index.html", html, "utf8");
  console.log("index.html written successfully!");
})();
