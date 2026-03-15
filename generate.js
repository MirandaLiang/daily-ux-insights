const fs = require("fs");
const https = require("https");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.0-flash";

// ── Call Gemini ────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  });

  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const req = https.request(url, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
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

  const prompt = `
You are an editor for a bilingual (English + Chinese) daily newsletter called "Daily UX Insights" for Staff Designers.

Today is ${today}. Find or synthesize ONE recent, compelling story about AI or UX design trends.

Respond ONLY in this exact JSON format (no markdown, no code fences, just raw JSON):
{
  "tag": "AI DESIGN",
  "title_en": "Short punchy headline (max 10 words)",
  "body_en": "2-3 sentence summary of the insight. Be specific and insightful, not generic.",
  "pull_quote": "One memorable quote or insight (1-2 sentences, can be from an industry voice or synthesized)",
  "body_en_extra": "1-2 more sentences expanding on the story or its implications for designers.",
  "title_zh": "Chinese translation of the headline",
  "body_zh": "Chinese translation of the full body (both paragraphs combined), written in natural Mandarin for design professionals."
}

Focus on topics like: generative UI, AI-native design patterns, LLM product design, design systems for AI, human-AI interaction, spatial computing, or emerging UX research.
`;

  const raw = await callGemini(prompt);

  // Strip any accidental markdown code fences
  const clean = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error("Gemini returned invalid JSON:\n" + raw);
  }
}

// ── Build today's date string ─────────────────────────────────────────────────
function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Inject content into HTML template ─────────────────────────────────────────
function buildHTML(story) {
  let html = fs.readFileSync("newsletter.template.html", "utf8");
  const date = formatDate();

  // Replace date
  html = html.replace(
    /March 15, 2026/g,
    date
  );

  // Replace tag
  html = html.replace(
    /AI DESIGN/g,
    escapeHtml(story.tag || "AI DESIGN")
  );

  // Replace EN headline
  html = html.replace(
    /The Shift from Deterministic<br>to <em>Probabilistic<\/em> UI/,
    `${escapeHtml(story.title_en).replace(/(\w+)$/, "<em>$1</em>")}`
  );

  // Replace EN body paragraph
  html = html.replace(
    /As generative AI becomes integrated into core products.*?dynamic generation\./,
    escapeHtml(story.body_en)
  );

  // Replace pull quote
  html = html.replace(
    /"The interface is no longer a fixed stage.*?"/,
    `"${escapeHtml(story.pull_quote)}"`
  );

  // Replace EN extra paragraph
  html = html.replace(
    /This shift demands new mental models:.*?than dictating it\./,
    escapeHtml(story.body_en_extra)
  );

  // Replace CN headline
  html = html.replace(
    /从确定性 UI 向概率性 UI 的转变/,
    escapeHtml(story.title_zh)
  );

  // Replace CN body
  html = html.replace(
    /随着生成式 AI 集成到核心产品中.*?布局系统。/,
    escapeHtml(story.body_zh)
  );

  return html;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  console.log("📰 Fetching today's story from Gemini...");

  const story = await fetchNewsStory();
  console.log("✅ Story fetched:", story.title_en);

  const html = buildHTML(story);
  fs.writeFileSync("index.html", html, "utf8");
  console.log("✅ index.html written successfully.");
})();
