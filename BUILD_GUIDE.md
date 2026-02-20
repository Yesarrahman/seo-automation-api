# SEO Automation Service — Build & Deploy Guide

## File Structure
```
seo-services-api/
├── index.js        ← main server
├── package.json    ← dependencies
├── README.md       ← API docs
└── .gitignore      ← ignore node_modules
```

---

## 1. Local Setup

### Clone your repo
```bash
git clone https://github.com/Yesarrahman/seo-services-api.git
cd seo-services-api
```

### Install dependencies
```bash
npm install
```
This installs: `express`, `axios`, `cheerio`, `puppeteer`
Puppeteer will auto-download its own bundled Chromium (~170MB) — this is normal.

### Run locally
```bash
npm start
```
Server starts at: `http://localhost:3000`

### Run in dev mode (auto-restart on file changes)
```bash
npm run dev
```

---

## 2. Test Locally with curl

### Test /crawl
```bash
curl -X POST http://localhost:3000/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://perfectobd.com/", "extractData": true}'
```

### Test /crawl-blog
```bash
curl -X POST http://localhost:3000/crawl-blog \
  -H "Content-Type: application/json" \
  -d '{"url": "https://perfectobd.com/blog"}'
```

### Test /generate-pdf
```bash
curl -X POST http://localhost:3000/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"html": "<h1>Hello World</h1>", "fileName": "test.pdf"}'
```

### Test /health
```bash
curl http://localhost:3000/health
```

---

## 3. Deploy to GitHub

### First time setup
```bash
git init
git remote add origin https://github.com/Yesarrahman/seo-services-api.git
```

### Push changes (every time you update files)
```bash
git add .
git commit -m "Update SEO service v3.0"
git push origin main
```

Render will auto-detect the push and redeploy automatically.

---

## 4. Deploy to Render

### Render Settings
| Setting | Value |
|---|---|
| Environment | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Node Version | 18+ |

### Environment Variables (optional)
| Variable | Value |
|---|---|
| `PORT` | Render sets this automatically |

### After pushing to GitHub:
1. Go to your Render dashboard
2. Click your `seo-services-api` service
3. Watch the deploy logs
4. Wait for: `🚀 SEO Automation Service v3.0 running on port 10000`
5. Service is live at: `https://seo-services-api.onrender.com`

---

## 5. Verify Deployment

```bash
# Check health
curl https://seo-services-api.onrender.com/health

# Test crawl on live server
curl -X POST https://seo-services-api.onrender.com/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://perfectobd.com/", "extractData": true}'
```

Expected response:
```json
{
  "url": "https://perfectobd.com/",
  "title": "Perfecto",
  "metaDescription": "...",
  "h1": "...",
  "h2s": ["...", "..."],
  "wordCount": 1234,
  "canonical": "...",
  "schema": null,
  "internalLinksCount": 12,
  "externalLinksCount": 3,
  "html": "..."
}
```

---

## 6. Common Issues & Fixes

| Error | Cause | Fix |
|---|---|---|
| `Cannot find module 'axios'` | package.json not pushed | Push package.json then redeploy |
| `Connection aborted` | n8n timeout too short | Set n8n HTTP node timeout to 120000ms |
| `wordCount: 0` | JS-rendered site | Puppeteer fallback handles it automatically |
| `403 Forbidden` | Site blocking scrapers | Browser headers in code handle most cases |
| `Timed out after 30000ms` | Puppeteer cold start | Already handled — timeout set to 60000ms |
| Server offline on Render | Free tier sleeps | First request wakes it up (~30s), then normal |

---

## 7. Render Free Tier Note

Render free tier **spins down after 15 minutes of inactivity**.
The first request after idle takes ~30 seconds to wake up.
To avoid this, upgrade to a paid Render plan or use a cron job to ping `/health` every 10 minutes.

### Keep-alive ping (optional cron in n8n)
Add a Schedule Trigger in n8n every 10 minutes → HTTP GET `https://seo-services-api.onrender.com/health`
