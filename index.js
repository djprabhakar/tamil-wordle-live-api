import express from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = Number(process.env.PORT || 4000)
const host = process.env.HOST || '0.0.0.0'
const maxGames = Number(process.env.MAX_LIVE_GAMES || 200)
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const storeFilePath = process.env.STORE_FILE
  ? path.resolve(process.env.STORE_FILE)
  : path.join(__dirname, 'data', 'live-games-store.json')

const splitGraphemes = (value) => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter('ta', { granularity: 'grapheme' }).segment(value), (segment) => segment.segment)
  }
  return Array.from(String(value || ''))
}

const normalizeIdList = (value) => (
  (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
)

const toGameWithStats = (input) => {
  const id = String(input?.id || '').trim().toUpperCase()
  const word = String(input?.word || '').trim()
  const wordLength = Number(input?.wordLength)
  const hostPlayerId = String(input?.hostPlayerId || '').trim()
  const hostNickname = String(input?.hostNickname || '').trim().slice(0, 24)
  const createdAt = Number(input?.createdAt) || Date.now()
  const participantPlayerIds = normalizeIdList(input?.participantPlayerIds)
  const successfulPlayerIds = normalizeIdList(input?.successfulPlayerIds)
  const unsuccessfulPlayerIds = normalizeIdList(input?.unsuccessfulPlayerIds)

  return {
    id,
    word,
    wordLength,
    hostPlayerId,
    hostNickname,
    createdAt,
    participantPlayerIds,
    successfulPlayerIds,
    unsuccessfulPlayerIds,
    totalParticipants: participantPlayerIds.length,
    successfulParticipants: successfulPlayerIds.length,
    unsuccessfulParticipants: unsuccessfulPlayerIds.length,
  }
}

const isValidGame = (game) => (
  Boolean(game.id)
  && (game.wordLength === 4 || game.wordLength === 5)
  && splitGraphemes(game.word).length === game.wordLength
  && Boolean(game.hostNickname)
)

const createLiveGameId = () => `G${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
const gamesById = new Map()
let persistQueue = Promise.resolve()

const writeStoreFile = async () => {
  const list = Array.from(gamesById.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxGames)
  await mkdir(path.dirname(storeFilePath), { recursive: true })
  await writeFile(storeFilePath, `${JSON.stringify({ games: list }, null, 2)}\n`, 'utf8')
}

const persistStore = async () => {
  persistQueue = persistQueue.then(writeStoreFile).catch(() => {})
  return persistQueue
}

const trimInMemoryGames = () => {
  const ordered = Array.from(gamesById.values()).sort((a, b) => b.createdAt - a.createdAt)
  if (ordered.length <= maxGames) return
  ordered.slice(maxGames).forEach((stale) => gamesById.delete(stale.id))
}

const loadStore = async () => {
  try {
    const raw = await readFile(storeFilePath, 'utf8')
    const parsed = JSON.parse(raw)
    const games = Array.isArray(parsed?.games) ? parsed.games : []
    games
      .map(toGameWithStats)
      .filter(isValidGame)
      .forEach((game) => gamesById.set(game.id, game))
    trimInMemoryGames()
  } catch (error) {
    if (error?.code === 'ENOENT') {
      await persistStore()
      return
    }
    // eslint-disable-next-line no-console
    console.error('Failed to load store file:', error)
  }
}

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

app.get('/live-games/:id', (req, res) => {
  const gameId = String(req.params.id || '').trim().toUpperCase()
  const game = gamesById.get(gameId)
  if (!game) {
    res.status(404).json({ error: 'Game not found.' })
    return
  }
  res.json(game)
})

app.post('/live-games', async (req, res) => {
  const normalized = toGameWithStats(req.body)
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
  trimInMemoryGames()
  await persistStore()

  res.status(201).json(game)
})

app.post('/live-games/:id/participation', async (req, res) => {
  const gameId = String(req.params.id || '').trim().toUpperCase()
  const playerId = String(req.body?.playerId || '').trim()
  const outcome = String(req.body?.outcome || '').trim().toLowerCase()

  if (!playerId) {
    res.status(400).json({ error: 'playerId is required.' })
    return
  }

  if (outcome !== 'success' && outcome !== 'failure') {
    res.status(400).json({ error: "outcome must be 'success' or 'failure'." })
    return
  }

  const existing = gamesById.get(gameId)
  if (!existing) {
    res.status(404).json({ error: 'Game not found.' })
    return
  }

  const participantSet = new Set(existing.participantPlayerIds)
  const successSet = new Set(existing.successfulPlayerIds)
  const failureSet = new Set(existing.unsuccessfulPlayerIds)

  participantSet.add(playerId)
  if (outcome === 'success') {
    successSet.add(playerId)
    failureSet.delete(playerId)
  } else {
    failureSet.add(playerId)
    successSet.delete(playerId)
  }

  const updated = toGameWithStats({
    ...existing,
    participantPlayerIds: Array.from(participantSet),
    successfulPlayerIds: Array.from(successSet),
    unsuccessfulPlayerIds: Array.from(failureSet),
  })

  gamesById.set(updated.id, updated)
  await persistStore()

  res.json(updated)
})

loadStore().then(() => {
  app.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`Live games API running on http://${host}:${port}`)
    // eslint-disable-next-line no-console
    console.log(`Store file: ${storeFilePath}`)
  })
})
