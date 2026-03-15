# Daily UX Insights

A zero-maintenance bilingual newsletter that auto-updates every day using Gemini AI.

## Setup (one-time, ~5 minutes)

### 1. Create a GitHub repo

Push this entire folder to a new GitHub repository.

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/daily-ux-insights.git
git push -u origin main
```

### 2. Get a Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click **Create API key**
3. Copy the key

### 3. Add the API key to GitHub Secrets

1. Go to your repo on GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `GEMINI_API_KEY`
5. Value: paste your Gemini API key
6. Click **Add secret**

### 4. Enable GitHub Pages

1. Go to **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `/ (root)`
4. Click **Save**

Your newsletter will be live at:
`https://YOUR_USERNAME.github.io/daily-ux-insights/`

### 5. Run it for the first time

1. Go to **Actions** tab in your repo
2. Click **Daily Newsletter**
3. Click **Run workflow** → **Run workflow**

This generates your first `index.html`. After that, it runs automatically every day at 8am UTC.

---

## Files

| File | Purpose |
|------|---------|
| `newsletter.template.html` | The visual template (don't rename) |
| `generate.js` | Calls Gemini and builds `index.html` |
| `.github/workflows/daily.yml` | GitHub Actions scheduler |
| `index.html` | Auto-generated — the live newsletter |

## Customise the schedule

Edit `.github/workflows/daily.yml` and change the cron expression:

```yaml
- cron: "0 8 * * *"   # 8:00 AM UTC daily
- cron: "0 9 * * 1-5" # 9:00 AM UTC, weekdays only
```

Use [crontab.guru](https://crontab.guru) to build your schedule.
