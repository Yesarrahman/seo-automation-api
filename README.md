# SEO Automation Service v3.0

A Node.js API for crawling competitor websites, blog articles, and generating PDFs.

## Stack
- **Express** — HTTP server
- **Axios + Cheerio** — fast HTML crawling (no lock files, concurrent-safe)
- **Puppeteer** — headless Chrome for JS-rendered sites + PDF generation

## Endpoints

### POST /crawl
Crawl a single page and extract full SEO data.
- Tries Axios first (fast)
- Falls back to Puppeteer if site is JS-rendered (wordCount = 0)

**Body:**
```json
{ "url": "https://example.com", "extractData": true }
```
**Returns:** `url, title, metaDescription, h1, h2s, wordCount, canonical, schema, internalLinksCount, externalLinksCount, html`

---

### POST /crawl-blog
Crawl a blog listing page and extract up to 15 articles with keywords.

**Body:**
```json
{ "url": "https://example.com/blog" }
```
**Returns:** `url, totalArticles, articles[{ url, title, h2s, keywords, publishedDate, wordCount }]`

---

### POST /generate-pdf
Generate a professional A4 PDF from HTML content.

**Body:**
```json
{ "html": "<html>...</html>", "fileName": "report.pdf" }
```
**Returns:** `success, pdf (base64), fileName, sizeBytes`

---

### GET /health
Health check endpoint.

## Deploy on Render
1. Push to GitHub
2. Connect repo to Render as a Web Service
3. Build command: `npm install`
4. Start command: `npm start`
