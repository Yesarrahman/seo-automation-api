const express = require('express')
const axios = require('axios')
const cheerio = require('cheerio')
const puppeteer = require('puppeteer')

const app = express()
app.use(express.json({ limit: '10mb' }))

// ============================================
// SHARED CONFIG
// ============================================

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0',
}

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
]

// ============================================
// HELPER: EXTRACT SEO DATA FROM CHEERIO
// ============================================

function extractSEO($, url) {
  const title = $('title').text().trim()
  const metaDescription = $('meta[name="description"]').attr('content') || ''
  const h1 = $('h1').first().text().trim()
  const h2s = $('h2').map((i, el) => $(el).text().trim()).get()

  // Word count from body text
  const bodyText = $('body').text()
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length

  // Canonical URL
  const canonical = $('link[rel="canonical"]').attr('href') || ''

  // Schema.org structured data
  let schema = null
  const schemaEl = $('script[type="application/ld+json"]').first()
  if (schemaEl.length) {
    try {
      schema = JSON.parse(schemaEl.html())
    } catch (e) {
      // Invalid JSON schema — skip
    }
  }

  // Link counts
  const hostname = new URL(url).hostname
  const internalLinks = $(`a[href^="/"], a[href*="${hostname}"]`).length
  const externalLinks = Math.max(0, $('a[href^="http"]').length - internalLinks)

  // Full HTML content
  const html = $.html()

  return {
    url,
    title,
    metaDescription,
    h1,
    h2s,
    wordCount,
    canonical,
    schema,
    internalLinksCount: internalLinks,
    externalLinksCount: externalLinks,
    html,
  }
}

// ============================================
// HELPER: CRAWL WITH AXIOS + CHEERIO (FAST)
// ============================================

async function crawlWithAxios(url, extractData) {
  const response = await axios.get(url, {
    timeout: 20000,
    headers: BROWSER_HEADERS,
    maxRedirects: 5,
  })
  const $ = cheerio.load(response.data)
  if (!extractData) return { url, html: $.html() }
  return extractSEO($, url)
}

// ============================================
// HELPER: CRAWL WITH PUPPETEER (JS-RENDERED FALLBACK)
// ============================================

async function crawlWithPuppeteer(url, extractData) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: PUPPETEER_ARGS,
    timeout: 60000,
  })

  try {
    const page = await browser.newPage()
    await page.setUserAgent(BROWSER_HEADERS['User-Agent'])
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Wait for JS rendering
    await new Promise(r => setTimeout(r, 2500))

    if (!extractData) {
      const html = await page.content()
      return { url, html }
    }

    const data = await page.evaluate((pageUrl) => {
      const title = document.title || ''
      const metaDesc = document.querySelector('meta[name="description"]')
      const metaDescription = metaDesc ? metaDesc.getAttribute('content') : ''
      const h1El = document.querySelector('h1')
      const h1 = h1El ? h1El.innerText.trim() : ''
      const h2s = Array.from(document.querySelectorAll('h2')).map(el => el.innerText.trim())
      const bodyText = document.body ? document.body.innerText : ''
      const wordCount = bodyText.split(/\s+/).filter(Boolean).length
      const canonicalEl = document.querySelector('link[rel="canonical"]')
      const canonical = canonicalEl ? canonicalEl.getAttribute('href') : ''

      // Schema.org
      let schema = null
      const schemaEl = document.querySelector('script[type="application/ld+json"]')
      if (schemaEl) {
        try { schema = JSON.parse(schemaEl.innerText) } catch (e) {}
      }

      // Link counts
      const hostname = new URL(pageUrl).hostname
      const allLinks = Array.from(document.querySelectorAll('a[href]'))
      const internalLinks = allLinks.filter(a => a.href.startsWith('/') || a.href.includes(hostname)).length
      const externalLinks = Math.max(0, allLinks.filter(a => a.href.startsWith('http')).length - internalLinks)

      const html = document.documentElement.outerHTML

      return { url: pageUrl, title, metaDescription, h1, h2s, wordCount, canonical, schema, internalLinksCount: internalLinks, externalLinksCount: externalLinks, html }
    }, url)

    return data
  } finally {
    await browser.close()
  }
}

// ============================================
// ENDPOINT: POST /crawl
// Crawl a single competitor or own website page
// Returns full SEO data with Puppeteer fallback
// ============================================

app.post('/crawl', async (req, res) => {
  const { url, extractData = true } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  try {
    let result = null
    let method = 'axios'

    // Step 1: Try axios + cheerio (fast, concurrent-safe)
    try {
      result = await crawlWithAxios(url, extractData)
      console.log(`[axios] ${url} → title="${result.title}", words=${result.wordCount}, h1="${result.h1}"`)
    } catch (e) {
      console.log(`[axios] failed for ${url}: ${e.message}`)
    }

    // Step 2: Fallback to Puppeteer if page is JS-rendered (wordCount = 0)
    if (!result || result.wordCount === 0) {
      console.log(`[puppeteer] falling back for ${url}...`)
      method = 'puppeteer'
      result = await crawlWithPuppeteer(url, extractData)
    }

    console.log(`✅ [${method}] ${url} → title="${result.title}", h1="${result.h1}", h2s=${result.h2s?.length}, words=${result.wordCount}`)
    res.json(result)

  } catch (error) {
    console.error(`❌ Crawl error for ${url}:`, error.message)
    res.status(500).json({ error: 'Failed to crawl URL', message: error.message })
  }
})

// ============================================
// ENDPOINT: POST /crawl-blog
// Crawl blog/article pages and extract content
// Finds up to 15 articles, extracts keywords + metadata
// ============================================

app.post('/crawl-blog', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  try {
    const articles = []

    // Fetch main blog/listing page
    const response = await axios.get(url, { timeout: 20000, headers: BROWSER_HEADERS })
    const $ = cheerio.load(response.data)
    const baseUrl = new URL(url)

    // Find article links
    const articleLinks = $('a[href*="/blog/"], a[href*="/article/"], a[href*="/post/"]')
      .map((i, el) => $(el).attr('href'))
      .get()
      .filter(Boolean)
      // Convert relative URLs to absolute
      .map(href => href.startsWith('/') ? `${baseUrl.protocol}//${baseUrl.host}${href}` : href)
      // Unique URLs only
      .filter((href, index, self) => self.indexOf(href) === index)
      // Limit to 15 articles
      .slice(0, 15)

    console.log(`[crawl-blog] Found ${articleLinks.length} article links on ${url}`)

    // Crawl each article individually
    for (const link of articleLinks) {
      try {
        const articleRes = await axios.get(link, { timeout: 15000, headers: BROWSER_HEADERS })
        const a$ = cheerio.load(articleRes.data)

        const title = a$('h1').first().text().trim() || a$('title').text().trim()
        const h2s = a$('h2').map((i, el) => a$(el).text().trim()).get()

        // Extract keywords via simple word frequency analysis
        const bodyText = a$('article, main, .content, .post-content, body').text()
        const wordCount = bodyText.split(/\s+/).filter(Boolean).length
        const words = bodyText.toLowerCase().match(/\b\w{4,}\b/g) || []
        const STOPWORDS = ['this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'their', 'will', 'what', 'when', 'your', 'more', 'also', 'some', 'than', 'then', 'into', 'about']
        const wordFreq = {}
        words.forEach(word => {
          if (!STOPWORDS.includes(word)) {
            wordFreq[word] = (wordFreq[word] || 0) + 1
          }
        })

        // Get top 10 keywords
        const keywords = Object.entries(wordFreq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {})

        // Published date — try to find
        let publishedDate = null
        const dateEl = a$('time[datetime]')
        if (dateEl.length) publishedDate = dateEl.attr('datetime')
        if (!publishedDate) {
          const metaDate = a$('meta[property="article:published_time"]').attr('content')
          if (metaDate) publishedDate = metaDate
        }

        articles.push({ url: link, title, h2s, keywords, publishedDate, wordCount })
        console.log(`[crawl-blog] ✅ ${link} → "${title}"`)

      } catch (e) {
        console.error(`[crawl-blog] ❌ Failed to crawl article ${link}:`, e.message)
      }
    }

    res.json({ url, totalArticles: articles.length, articles })

  } catch (error) {
    console.error('[crawl-blog] Error:', error.message)
    res.status(500).json({ error: 'Failed to crawl blog', message: error.message })
  }
})

// ============================================
// ENDPOINT: POST /generate-pdf
// Generate professional PDF from HTML content
// Returns base64-encoded PDF
// ============================================

app.post('/generate-pdf', async (req, res) => {
  const { html, fileName = 'report.pdf' } = req.body
  if (!html) return res.status(400).json({ error: 'HTML content is required' })

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: PUPPETEER_ARGS,
      timeout: 60000,
    })

    const page = await browser.newPage()

    // Set HTML content and wait for all resources to load
    await page.setContent(html, { waitUntil: 'networkidle0' })

    // Generate PDF with professional settings
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width: 100%; font-size: 9px; padding: 5px 15px; color: #999; text-align: center; font-family: Arial, sans-serif;">
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `,
    })

    await browser.close()

    console.log(`✅ [generate-pdf] Generated ${fileName} (${pdfBuffer.length} bytes)`)

    // Return PDF as base64
    res.json({
      success: true,
      pdf: pdfBuffer.toString('base64'),
      fileName,
      sizeBytes: pdfBuffer.length,
    })

  } catch (error) {
    console.error('[generate-pdf] Error:', error.message)
    res.status(500).json({ error: 'Failed to generate PDF', message: error.message })
  }
})

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'seo-automation-service',
    version: '3.0.0',
    endpoints: {
      crawl: 'POST /crawl',
      crawlBlog: 'POST /crawl-blog',
      generatePdf: 'POST /generate-pdf',
    },
  })
})

app.get('/', (req, res) => {
  res.json({
    service: 'SEO Automation Service',
    version: '3.0.0',
    description: 'Crawl competitor pages, blog articles, and generate PDFs',
    endpoints: [
      {
        method: 'POST',
        path: '/crawl',
        description: 'Crawl a single page and extract SEO data',
        body: { url: 'string (required)', extractData: 'boolean (default: true)' },
        returns: 'url, title, metaDescription, h1, h2s, wordCount, canonical, schema, internalLinksCount, externalLinksCount, html',
      },
      {
        method: 'POST',
        path: '/crawl-blog',
        description: 'Crawl blog/article listing page and extract up to 15 articles',
        body: { url: 'string (required)' },
        returns: 'url, totalArticles, articles[{ url, title, h2s, keywords, publishedDate, wordCount }]',
      },
      {
        method: 'POST',
        path: '/generate-pdf',
        description: 'Generate a professional PDF from HTML content',
        body: { html: 'string (required)', fileName: 'string (default: report.pdf)' },
        returns: 'success, pdf (base64), fileName, sizeBytes',
      },
      {
        method: 'GET',
        path: '/health',
        description: 'Health check',
      },
    ],
  })
})

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 SEO Automation Service v3.0 running on port ${PORT}`)
  console.log(`📋 Endpoints:`)
  console.log(`   POST /crawl          → Crawl single page (axios → puppeteer fallback)`)
  console.log(`   POST /crawl-blog     → Crawl blog articles (up to 15)`)
  console.log(`   POST /generate-pdf   → Generate PDF from HTML`)
  console.log(`   GET  /health         → Health check`)
})
