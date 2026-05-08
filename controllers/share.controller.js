function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function clampText(value, maxLength) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}…` : normalized
}

function sanitizeScore(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.min(parsed, 9999)
}

function buildPlayPath(category, game) {
  return `/#/play/${encodeURIComponent(category)}/${encodeURIComponent(game)}`
}

function buildAbsoluteUrl(req, pathname, query) {
  const origin = `${req.protocol}://${req.get('host')}`
  const url = new URL(pathname, origin)
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  return url.toString()
}

function splitTitle(title) {
  const text = clampText(title, 52) || 'Featured Challenge'
  const words = text.split(' ')
  if (words.length <= 2) return [text]

  const midpoint = Math.ceil(words.length / 2)
  const first = words.slice(0, midpoint).join(' ')
  const second = words.slice(midpoint).join(' ')

  if (first.length <= 24 && second.length <= 24) {
    return [first, second]
  }

  return text.length > 26
    ? [text.slice(0, 26).trimEnd(), text.slice(26).trimStart()]
    : [text]
}

function buildShareDescription({ game, category, score }) {
  return `${game} · ${category} · ${score} points`
}

function buildOgImageSvg({ game, category, score }) {
  const [lineOne, lineTwo] = splitTitle(game)
  const safeGameLineOne = escapeXml(lineOne)
  const safeGameLineTwo = lineTwo ? escapeXml(lineTwo) : ''
  const safeCategory = escapeXml(clampText(category, 22) || 'Category')
  const safeScore = escapeXml(score)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
  <defs>
    <linearGradient id="bg" x1="104" y1="86" x2="1088" y2="548" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F4FFF7"/>
      <stop offset=".58" stop-color="#F8FAFC"/>
      <stop offset="1" stop-color="#FFF7E6"/>
    </linearGradient>
    <linearGradient id="cta" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#10B981"/>
      <stop offset="1" stop-color="#047857"/>
    </linearGradient>
    <linearGradient id="score" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#F59E0B"/>
      <stop offset="1" stop-color="#EF4444"/>
    </linearGradient>
    <filter id="shadow" x="82" y="70" width="1040" height="500" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dy="18"/>
      <feGaussianBlur stdDeviation="22"/>
      <feColorMatrix values="0 0 0 0 0.0588235 0 0 0 0 0.0941176 0 0 0 0 0.196078 0 0 0 0.16 0"/>
      <feBlend in2="BackgroundImageFix" result="effect1_dropShadow_1_1"/>
      <feBlend in="SourceGraphic" in2="effect1_dropShadow_1_1" result="shape"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="#EEF9F2"/>
  <circle cx="166" cy="122" r="146" fill="#D1FAE5"/>
  <circle cx="1048" cy="118" r="102" fill="#EDE9FE"/>
  <circle cx="982" cy="536" r="150" fill="#FEF3C7"/>

  <g filter="url(#shadow)">
    <rect x="102" y="86" width="996" height="458" rx="34" fill="url(#bg)"/>
    <rect x="102.75" y="86.75" width="994.5" height="456.5" rx="33.25" stroke="#A7F3D0" stroke-width="1.5"/>
  </g>

  <text x="146" y="142" fill="#059669" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="2">FIVE HINTS</text>
  <text x="146" y="222" fill="#0F172A" font-family="Georgia, serif" font-size="72" font-weight="700">Can you beat</text>
  <text x="146" y="296" fill="#0F172A" font-family="Georgia, serif" font-size="72" font-weight="700">this run?</text>

  <rect x="146" y="334" width="216" height="44" rx="22" fill="#FFFFFF" stroke="#D8E4EE"/>
  <text x="174" y="363" fill="#475569" font-family="Arial, sans-serif" font-size="22" font-weight="700">${safeCategory}</text>

  <text x="146" y="430" fill="#0F172A" font-family="Arial, sans-serif" font-size="46" font-weight="800">${safeGameLineOne}</text>
  ${safeGameLineTwo ? `<text x="146" y="484" fill="#0F172A" font-family="Arial, sans-serif" font-size="46" font-weight="800">${safeGameLineTwo}</text>` : ''}

  <rect x="146" y="504" width="344" height="64" rx="18" fill="url(#cta)"/>
  <text x="194" y="545" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="30" font-weight="800">Play the challenge</text>

  <rect x="760" y="148" width="226" height="134" rx="26" fill="#FFFFFF" stroke="#E2E8F0"/>
  <text x="790" y="188" fill="#64748B" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="1">YOUR SCORE</text>
  <text x="786" y="266" fill="url(#score)" font-family="Arial, sans-serif" font-size="84" font-weight="900">${safeScore}</text>
  <text x="900" y="266" fill="#0F172A" font-family="Arial, sans-serif" font-size="32" font-weight="800">pts</text>

  <rect x="724" y="320" width="292" height="132" rx="28" fill="#0F172A"/>
  <text x="754" y="360" fill="#86EFAC" font-family="Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="1.3">THE DARE</text>
  <text x="754" y="414" fill="#FFFFFF" font-family="Georgia, serif" font-size="34" font-weight="700">Think you can</text>
  <text x="754" y="454" fill="#FFFFFF" font-family="Georgia, serif" font-size="34" font-weight="700">top this score?</text>

  <g transform="rotate(-7 1048 160)">
    <rect x="1032" y="128" width="88" height="88" rx="18" fill="#FEF3C7" stroke="#F59E0B" stroke-width="4"/>
    <text x="1061" y="188" fill="#B45309" font-family="Arial, sans-serif" font-size="48" font-weight="900">H</text>
  </g>

  <g transform="rotate(9 1094 256)">
    <rect x="1054" y="214" width="88" height="88" rx="18" fill="#EDE9FE" stroke="#8B5CF6" stroke-width="4"/>
    <text x="1086" y="274" fill="#6D28D9" font-family="Arial, sans-serif" font-size="48" font-weight="900">?</text>
  </g>
</svg>`
}

function parseShareParams(req) {
  const game = clampText(req.query.game, 52) || 'Featured Challenge'
  const category = clampText(req.query.category, 22) || 'General'
  const score = sanitizeScore(req.query.score)
  return { game, category, score }
}

function createShareController() {
  return {
    getSharePage(req, res) {
      const { game, category, score } = parseShareParams(req)
      const ogDescription = buildShareDescription({ game, category, score })
      const ogImageUrl = buildAbsoluteUrl(req, '/og-image', { game, category, score })
      const canonicalUrl = buildAbsoluteUrl(req, '/share', { game, category, score })
      const playPath = buildPlayPath(category, game)

      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Can you beat this Five Hints run?</title>
    <meta name="description" content="${escapeHtml(ogDescription)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Five Hints" />
    <meta property="og:title" content="Can you beat this Five Hints run?" />
    <meta property="og:description" content="${escapeHtml(ogDescription)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/svg+xml" />
    <meta property="og:image:alt" content="Five Hints challenge card for ${escapeHtml(game)} with ${escapeHtml(String(score))} points." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Can you beat this Five Hints run?" />
    <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
    <style>
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #eef9f2;
        color: #0f172a;
        display: grid;
        place-items: center;
        min-height: 100vh;
      }
      main {
        max-width: 720px;
        background: rgba(255,255,255,0.92);
        border: 1px solid rgba(16,185,129,0.14);
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 24px 60px rgba(15,23,42,0.12);
      }
      .eyebrow {
        margin: 0 0 8px;
        color: #059669;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font: 700 56px/0.95 Georgia, serif;
      }
      p {
        margin: 16px 0 0;
        color: #475569;
        font-size: 18px;
        line-height: 1.6;
      }
      .meta {
        display: inline-flex;
        gap: 10px;
        align-items: center;
        margin-top: 20px;
        padding: 12px 16px;
        border-radius: 999px;
        background: white;
        border: 1px solid rgba(15,23,42,0.08);
        font-weight: 700;
      }
      .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 24px;
        min-height: 54px;
        padding: 0 22px;
        border-radius: 16px;
        text-decoration: none;
        color: white;
        background: linear-gradient(135deg, #10b981, #047857);
        font-size: 18px;
        font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Five Hints</p>
      <h1>Beat this run.</h1>
      <p>${escapeHtml(game)} in ${escapeHtml(category)} is sitting at ${escapeHtml(String(score))} points. Open the same challenge and see if you can post the better finish.</p>
      <div class="meta">
        <span>${escapeHtml(category)}</span>
        <span>·</span>
        <span>${escapeHtml(String(score))} pts</span>
      </div>
      <div>
        <a class="cta" href="${escapeHtml(playPath)}">Play the challenge</a>
      </div>
    </main>
  </body>
</html>`)
    },

    getOgImage(req, res) {
      const { game, category, score } = parseShareParams(req)
      const svg = buildOgImageSvg({ game, category, score: String(score) })
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.send(svg)
    },
  }
}

module.exports = {
  createShareController,
}
