import express from 'express'

const app = express()
const port = Number(process.env.PORT || 4000)
const host = process.env.HOST || '0.0.0.0'
const maxGames = Number(process.env.MAX_LIVE_GAMES || 200)
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const splitGraphemes = (value) => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter('ta', { granularity: 'grapheme' }).segment(value), (segment) => segment.segment)
  }
  return Array.from(String(value || ''))
}

const normalizeGame = (input) => {
  const id = String(input?.id || '').trim().toUpperCase()
  const word = String(input?.word || '').trim()
  const wordLength = Number(input?.wordLength)
  const hostPlayerId = String(input?.hostPlayerId || '').trim()
  const hostNickname = String(input?.hostNickname || '').trim().slice(0, 24)
  const createdAt = Number(input?.createdAt) || Date.now()
  return { id, word, wordLength, hostPlayerId, hostNickname, createdAt }
}

const isValidGame = (game) => (
  Boolean(game.id)
  && (game.wordLength === 4 || game.wordLength === 5)
  && splitGraphemes(game.word).length === game.wordLength
  && Boolean(game.hostNickname)
)

const createLiveGameId = () => `G${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
const gamesById = new Map()

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

app.use(express.json({ limit: '64kb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: Date.now() })
})

app.get('/live-games', (_req, res) => {
  const list = Array.from(gamesById.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxGames)
  res.json(list)
})

app.post('/live-games', (req, res) => {
  const normalized = normalizeGame(req.body)
  const game = {
    ...normalized,
    id: normalized.id || createLiveGameId(),
    createdAt: normalized.createdAt || Date.now(),
  }

  if (!isValidGame(game)) {
    res.status(400).json({
      error: 'Invalid game payload. Required: id, word, wordLength(4|5), hostPlayerId, hostNickname, createdAt.',
    })
    return
  }

  gamesById.set(game.id, game)

  const ordered = Array.from(gamesById.values()).sort((a, b) => b.createdAt - a.createdAt)
  if (ordered.length > maxGames) {
    ordered.slice(maxGames).forEach((stale) => gamesById.delete(stale.id))
  }

  res.status(201).json(game)
})

app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Live games API running on http://${host}:${port}`)
})
