/*
README

Words JSON placement:
- Place your words file at: data/common_500_words_with_5_clues.json
- Expected structure:
  [
    {
      "word": "car",
      "category": "thing",
      "clues": ["vehicle", "engine", "road", "electric", "autonomous"]
    }
  ]

Mounting in an existing Express app:
- const express = require('express')
- const { createApp } = require('./app')
- const { app } = createApp()
- app.listen(process.env.PORT || 4000)

Or mount only the words module:
- const { createWordsRouter } = require('./routes/words.routes')
- const { WordsService } = require('./services/words.service')
- const wordsService = new WordsService()
- wordsService.loadFromDisk()
- app.use('/api/words', createWordsRouter(wordsService))
*/

const express = require('express')
const fs = require('fs')
const path = require('path')
const swaggerJsdoc = require('swagger-jsdoc')
const swaggerUi = require('swagger-ui-express')

const { openapi } = require('./docs/openapi')
const { createShareRouter } = require('./routes/share.routes')
const { createSessionsRouter } = require('./routes/sessions.routes')
const { createWordsRouter } = require('./routes/words.routes')
const { SessionsService } = require('./services/sessions.service')
const { HttpError, WordsService } = require('./services/words.service')

const maxGames = Number(process.env.MAX_LIVE_GAMES || 200)
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const storeFilePath = process.env.STORE_FILE
  ? path.resolve(process.env.STORE_FILE)
  : path.join(__dirname, 'data', 'live-games-store.json')

const splitGraphemes = (value) => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(
      new Intl.Segmenter('ta', { granularity: 'grapheme' }).segment(value),
      (segment) => segment.segment
    )
  }

  return Array.from(String(value || ''))
}

const normalizeIdList = (value) => (
  (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
)

const toGameWithStats = (input) => {
  const id = String(input && input.id ? input.id : '').trim().toUpperCase()
  const word = String(input && input.word ? input.word : '').trim()
  const wordLength = Number(input && input.wordLength)
  const hostPlayerId = String(input && input.hostPlayerId ? input.hostPlayerId : '').trim()
  const hostNickname = String(input && input.hostNickname ? input.hostNickname : '').trim().slice(0, 24)
  const createdAt = Number(input && input.createdAt) || Date.now()
  const participantPlayerIds = normalizeIdList(input && input.participantPlayerIds)
  const successfulPlayerIds = normalizeIdList(input && input.successfulPlayerIds)
  const unsuccessfulPlayerIds = normalizeIdList(input && input.unsuccessfulPlayerIds)

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

function createLiveGamesStore() {
  const gamesById = new Map()
  let persistQueue = Promise.resolve()

  const writeStoreFile = async () => {
    const list = Array.from(gamesById.values())
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, maxGames)

    await fs.promises.mkdir(path.dirname(storeFilePath), { recursive: true })
    await fs.promises.writeFile(storeFilePath, `${JSON.stringify({ games: list }, null, 2)}\n`, 'utf8')
  }

  const persistStore = async () => {
    persistQueue = persistQueue.then(writeStoreFile).catch(() => {})
    return persistQueue
  }

  const trimInMemoryGames = () => {
    const ordered = Array.from(gamesById.values()).sort((left, right) => right.createdAt - left.createdAt)
    if (ordered.length <= maxGames) {
      return
    }

    ordered.slice(maxGames).forEach((stale) => gamesById.delete(stale.id))
  }

  const loadStore = async () => {
    try {
      const raw = await fs.promises.readFile(storeFilePath, 'utf8')
      const parsed = JSON.parse(raw)
      const games = Array.isArray(parsed && parsed.games) ? parsed.games : []

      games
        .map(toGameWithStats)
        .filter(isValidGame)
        .forEach((game) => gamesById.set(game.id, game))

      trimInMemoryGames()
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        await persistStore()
        return
      }

      console.error('Failed to load store file:', error)
    }
  }

  return {
    gamesById,
    loadStore,
    persistStore,
    trimInMemoryGames,
  }
}

function addCors(app) {
  app.use((req, res, next) => {
    const origin = req.headers.origin

    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*')
    }

    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    next()
  })
}

function addLiveGameRoutes(app, liveGamesStore) {
  app.get('/live-games', (_req, res) => {
    const list = Array.from(liveGamesStore.gamesById.values())
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, maxGames)

    res.json(list)
  })

  app.get('/live-games/:id', (req, res) => {
    const gameId = String(req.params.id || '').trim().toUpperCase()
    const game = liveGamesStore.gamesById.get(gameId)

    if (!game) {
      res.status(404).json({ error: 'Game not found.' })
      return
    }

    res.json(game)
  })

  app.post('/live-games', async (req, res, next) => {
    try {
      const normalized = toGameWithStats(req.body || {})
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

      liveGamesStore.gamesById.set(game.id, game)
      liveGamesStore.trimInMemoryGames()
      await liveGamesStore.persistStore()

      res.status(201).json(game)
    } catch (error) {
      next(error)
    }
  })

  app.post('/live-games/:id/participation', async (req, res, next) => {
    try {
      const gameId = String(req.params.id || '').trim().toUpperCase()
      const playerId = String(req.body && req.body.playerId ? req.body.playerId : '').trim()
      const outcome = String(req.body && req.body.outcome ? req.body.outcome : '').trim().toLowerCase()

      if (!playerId) {
        res.status(400).json({ error: 'playerId is required.' })
        return
      }

      if (outcome !== 'success' && outcome !== 'failure') {
        res.status(400).json({ error: "outcome must be 'success' or 'failure'." })
        return
      }

      const existing = liveGamesStore.gamesById.get(gameId)
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

      liveGamesStore.gamesById.set(updated.id, updated)
      await liveGamesStore.persistStore()

      res.json(updated)
    } catch (error) {
      next(error)
    }
  })
}

function createApp(options = {}) {
  const app = express()
  app.set('trust proxy', true)
  const wordsService = options.wordsService || new WordsService()
  const sessionsService = options.sessionsService || new SessionsService({ wordsService })
  const liveGamesStore = createLiveGamesStore()

  wordsService.loadFromDisk()

  addCors(app)
  app.use(express.json({ limit: '64kb' }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(
`User-agent: facebookexternalhit
Allow: /

User-agent: Facebot
Allow: /

User-agent: *
Allow: /
`)
  })

  addDocs(app)
  app.use(createShareRouter())
  app.use('/api/words', createWordsRouter(wordsService))
  app.use('/api/sessions', createSessionsRouter(sessionsService))
  addLiveGameRoutes(app, liveGamesStore)
  addErrorHandling(app)

  return {
    app,
    liveGamesStore,
    sessionsService,
    wordsService,
  }
}

function addErrorHandling(app) {
  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
  })

  app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) {
      const payload = { error: error.message }
      if (error.details) {
        payload.details = error.details
      }

      res.status(error.statusCode).json(payload)
      return
    }

    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      res.status(400).json({ error: 'Malformed JSON request body.' })
      return
    }

    console.error(error)
    res.status(500).json({ error: 'Internal server error.' })
  })
}

function addDocs(app) {
  const spec = swaggerJsdoc({
    definition: openapi,
    apis: [],
  })

  app.get('/openapi.json', (_req, res) => {
    res.json(spec)
  })
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }))
}

function createApp(options = {}) {
  const app = express()
  app.set('trust proxy', true)
  const wordsService = options.wordsService || new WordsService()
  const sessionsService = options.sessionsService || new SessionsService({ wordsService })
  const liveGamesStore = createLiveGamesStore()

  wordsService.loadFromDisk()

  addCors(app)
  app.use(express.json({ limit: '64kb' }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  addDocs(app)
  app.use(createShareRouter())
  app.use('/api/words', createWordsRouter(wordsService))
  app.use('/api/sessions', createSessionsRouter(sessionsService))
  addLiveGameRoutes(app, liveGamesStore)
  addErrorHandling(app)

  return {
    app,
    liveGamesStore,
    sessionsService,
    wordsService,
  }
}

module.exports = {
  createApp,
}
