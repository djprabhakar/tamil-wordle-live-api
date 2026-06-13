const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { HttpError } = require('./words.service')
const { normalizeWord } = require('../utils/normalize')

const SESSION_TTL_MS = 2 * 60 * 60 * 1000
const PLAYER_PRESENCE_TTL_MS = 60 * 1000
const MAX_PLAYERS = 8
const VALID_ENTRY_COUNTS = new Set([0, 10, 20, 30, 50])
const VALID_LIST_STATUSES = new Set(['lobby', 'playing', 'finished', 'all'])
const SESSION_RESULTS_DIR = path.join(__dirname, '..', 'data', 'group_game_results')
const ACTIVE_GROUP_GAMES_FILE = path.join(__dirname, '..', 'data', 'active_group_games.json')

function toPublicStatus(status) {
  if (status === 'lobby') {
    return 'Lobby'
  }

  if (status === 'playing') {
    return 'InProgress'
  }

  if (status === 'finished') {
    return 'Finished'
  }

  return String(status || '')
}

function normalizeNickname(value) {
  return String(value || '').trim()
}

function validateNickname(value) {
  const nickname = normalizeNickname(value)

  if (!nickname) {
    throw new HttpError(400, 'nickname is required.')
  }

  if (nickname.length > 30) {
    throw new HttpError(400, 'nickname must be 1-30 characters.')
  }

  return nickname
}

function validateRequiredString(value, fieldName) {
  const safeValue = String(value || '').trim()

  if (!safeValue) {
    throw new HttpError(400, `${fieldName} is required.`)
  }

  return safeValue
}

function validateEntryCount(value) {
  const entryCount = Number(value)

  if (!Number.isInteger(entryCount) || !VALID_ENTRY_COUNTS.has(entryCount)) {
    throw new HttpError(400, 'entryCount must be one of 10, 20, 30, 50, or 0.')
  }

  return entryCount
}

function validateCode(value) {
  const code = String(value || '').trim()

  if (!/^\d{4}$/.test(code)) {
    throw new HttpError(400, 'code must be exactly 4 digits.')
  }

  return code
}

function normalizePlayerToken(value) {
  return String(value || '').trim()
}

function createOpaqueToken(bytes = 18) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function createPlayer(name, isHost = false) {
  const now = new Date().toISOString()
  return {
    playerId: createOpaqueToken(9),
    playerToken: createOpaqueToken(18),
    name,
    isHost,
    connected: true,
    lastSeenAt: now,
    submitted: false,
    score: 0,
    entryPoints: 0,
    correct: false,
    answer: '',
    currentAttempt: 0,
    hintsUsed: 0,
    guesses: [],
  }
}

function normalizeAnswer(value) {
  return normalizeWord(String(value || '').trim())
}

function toSafeFilePart(value, fallback = 'session') {
  const safeValue = String(value || '').trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return safeValue || fallback
}

function sanitizeSessionEntry(entry, options = {}) {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const includeAnswer = Boolean(options.includeAnswer || options.revealAnswer)

  return {
    id: entry.id ?? null,
    title: typeof entry.title === 'string' ? entry.title : '',
    category: typeof entry.category === 'string' ? entry.category : '',
    game_name: typeof entry.game_name === 'string' ? entry.game_name : '',
    clues: Array.isArray(entry.clues) ? entry.clues : [],
    'dummy-clues': Array.isArray(entry['dummy-clues']) ? entry['dummy-clues'] : [],
    answer: includeAnswer && typeof entry.answer === 'string' ? entry.answer : '',
  }
}

class SessionsService {
  constructor(options = {}) {
    this.wordsService = options.wordsService
    this.sessionsById = new Map()
    this.sessionIdsByCode = new Map()
    this.ttlMs = options.ttlMs || SESSION_TTL_MS
    this.playerPresenceTtlMs = options.playerPresenceTtlMs || PLAYER_PRESENCE_TTL_MS
  }

  cleanupExpiredSessions() {
    const now = Date.now()

    for (const [sessionId, session] of this.sessionsById.entries()) {
      if (session.expiresAt <= now) {
        this.updateActiveGameRecord(session, {
          active: false,
          sessionStatus: 'Expired',
          deactivatedAt: new Date().toISOString(),
        })
        this.sessionsById.delete(sessionId)
        this.sessionIdsByCode.delete(session.code)
      }
    }
  }

  readActiveGames() {
    try {
      if (!fs.existsSync(ACTIVE_GROUP_GAMES_FILE)) {
        return []
      }
      const text = fs.readFileSync(ACTIVE_GROUP_GAMES_FILE, 'utf8')
      const parsed = text ? JSON.parse(text) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  writeActiveGames(records) {
    fs.mkdirSync(path.dirname(ACTIVE_GROUP_GAMES_FILE), { recursive: true })
    fs.writeFileSync(ACTIVE_GROUP_GAMES_FILE, JSON.stringify(records, null, 2), 'utf8')
  }

  buildActiveGameRecord(session) {
    const hostPlayer = session.players.find((player) => player.isHost)
    return {
      sessionId: session.sessionId,
      code: session.code,
      category: session.category,
      game: session.game,
      gameCreatedBy: session.gameCreatedBy || '',
      hostName: hostPlayer?.name || '',
      playerCount: session.players.length,
      participantNames: session.players.map((player) => player.name),
      totalEntries: session.totalEntries,
      status: toPublicStatus(session.status),
      active: session.status !== 'finished',
      createdAt: session.createdAt || null,
      startedAt: session.startedAt || null,
      finishedAt: session.finishedAt || null,
      deactivatedAt: session.deactivatedAt || null,
    }
  }

  updateActiveGameRecord(session, overrides = {}) {
    const current = this.readActiveGames()
    const nextRecord = {
      ...this.buildActiveGameRecord(session),
      ...overrides,
    }
    const index = current.findIndex((record) => record.sessionId === session.sessionId)
    if (index >= 0) current[index] = nextRecord
    else current.push(nextRecord)
    this.writeActiveGames(current)
    return nextRecord
  }

  pruneStaleActiveGames(records) {
    const liveSessionIds = new Set(this.sessionsById.keys())
    let changed = false

    const nextRecords = records.flatMap((record) => {
      if (!record || typeof record !== 'object') return []
      const sessionId = `${record.sessionId || ''}`.trim()
      if (!sessionId) {
        changed = true
        return []
      }

      const isLive = liveSessionIds.has(sessionId)
      const isActive = record.active !== false

      if (isLive || !isActive) {
        return [record]
      }

      changed = true
      return [{
        ...record,
        active: false,
        status: record.status === 'Lobby' ? 'Unavailable' : record.status,
        deactivatedAt: record.deactivatedAt || new Date().toISOString(),
      }]
    })

    if (changed) {
      this.writeActiveGames(nextRecords)
    }

    return nextRecords
  }

  createSessionId() {
    return crypto.randomBytes(9).toString('base64url')
  }

  createUniqueCode() {
    if (this.sessionIdsByCode.size >= 10000) {
      throw new HttpError(503, 'No session codes are currently available.')
    }

    let code
    do {
      code = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    } while (this.sessionIdsByCode.has(code))

    return code
  }

  getSessionOrThrow(sessionId) {
    this.cleanupExpiredSessions()

    const session = this.sessionsById.get(String(sessionId || '').trim())
    if (!session) {
      throw new HttpError(404, 'Session not found.')
    }

    return session
  }

  touchSession(session) {
    session.expiresAt = Date.now() + this.ttlMs
  }

  refreshPlayerPresence(session) {
    const cutoff = Date.now() - this.playerPresenceTtlMs
    session.players.forEach((player) => {
      const lastSeenAt = Date.parse(player.lastSeenAt || 0)
      player.connected = Number.isFinite(lastSeenAt) && lastSeenAt >= cutoff
    })
  }

  markPlayerPresence(session, player) {
    this.touchSession(session)
    player.connected = true
    player.lastSeenAt = new Date().toISOString()
    this.refreshPlayerPresence(session)
  }

  getEntryAnswer(session) {
    const entry = session.entries[session.currentEntry]
    return entry && typeof entry.answer === 'string' ? entry.answer : ''
  }

  getCurrentEntry(session, options = {}) {
    const entry = session.entries[session.currentEntry]
    return sanitizeSessionEntry(entry, options)
  }

  getResultFileName(session) {
    const hostPlayer = session.players.find((player) => player.isHost)
    return `${session.code}-${toSafeFilePart(session.game, 'game')}_${toSafeFilePart(hostPlayer?.name, 'host')}.json`
  }

  getResultFilePath(session) {
    return path.join(SESSION_RESULTS_DIR, this.getResultFileName(session))
  }

  buildScorePersistence(session) {
    return {
      sessionId: session.sessionId,
      code: session.code,
      category: session.category,
      game: session.game,
      hostName: session.players.find((player) => player.isHost)?.name || '',
      status: toPublicStatus(session.status),
      totalEntries: session.totalEntries,
      startedAt: session.startedAt || null,
      finishedAt: session.finishedAt || null,
      updatedAt: new Date().toISOString(),
      resultFileName: session.resultFileName || this.getResultFileName(session),
      entries: Array.isArray(session.scoreLog) ? session.scoreLog : [],
    }
  }

  persistScoreFile(session) {
    fs.mkdirSync(SESSION_RESULTS_DIR, { recursive: true })
    if (!session.resultFileName) {
      session.resultFileName = this.getResultFileName(session)
    }
    if (!session.resultFilePath) {
      session.resultFilePath = this.getResultFilePath(session)
    }

    const payload = this.buildScorePersistence(session)
    fs.writeFileSync(session.resultFilePath, JSON.stringify(payload, null, 2), 'utf8')
    return payload
  }

  upsertScoreLog(session, player, entryIndex) {
    const safeEntryIndex = Number.isInteger(entryIndex) ? entryIndex : session.currentEntry
    const entry = session.entries[safeEntryIndex] || null
    const records = Array.isArray(session.scoreLog) ? session.scoreLog : []
    const existingIndex = records.findIndex((record) => record.entryIndex === safeEntryIndex && record.playerName === player.name)
    const nextRecord = {
      entryIndex: safeEntryIndex,
      entryNumber: safeEntryIndex + 1,
      entryId: entry?.id ?? null,
      entryTitle: typeof entry?.title === 'string' ? entry.title : '',
      entryCategory: typeof entry?.category === 'string' ? entry.category : session.category,
      playerName: player.name,
      isHost: player.isHost,
      submittedAnswer: player.answer || '',
      correct: Boolean(player.correct),
      entryPoints: player.entryPoints ?? 0,
      totalScore: player.score ?? 0,
      submittedAt: new Date().toISOString(),
    }

    if (existingIndex >= 0) {
      records[existingIndex] = nextRecord
    } else {
      records.push(nextRecord)
    }

    records.sort((left, right) => {
      if (left.entryIndex !== right.entryIndex) return left.entryIndex - right.entryIndex
      return left.playerName.localeCompare(right.playerName)
    })

    session.scoreLog = records
  }

  isNicknameTaken(session, nickname) {
    const normalized = normalizeNickname(nickname).toLowerCase()
    return session.players.some((player) => player.name.toLowerCase() === normalized)
  }

  sanitizeProgressGuesses(guesses, currentAttempt) {
    const maxLength = Math.min(Math.max(currentAttempt, 0) + 1, 5)
    if (!Array.isArray(guesses) || maxLength <= 0) return []
    return guesses.slice(0, maxLength).map((guess) => String(guess || '').trim())
  }

  findPlayerByToken(session, playerToken) {
    const normalizedToken = normalizePlayerToken(playerToken)
    if (!normalizedToken) return null
    return session.players.find((player) => player.playerToken === normalizedToken) || null
  }

  resolvePlayer(session, options = {}, config = {}) {
    const { required = true, allowNicknameFallback = true, markPresence = true } = config
    const playerToken = normalizePlayerToken(options.playerToken ?? options.participantToken)
    let player = playerToken ? this.findPlayerByToken(session, playerToken) : null

    if (!player && allowNicknameFallback && normalizeNickname(options.nickname)) {
      player = this.findPlayer(session, options.nickname)
    }

    if (!player) {
      if (!required) return null
      throw new HttpError(404, 'Player not found.')
    }

    if (markPresence) {
      this.markPlayerPresence(session, player)
    }

    return player
  }

  toPublicSession(session, viewerPlayer = null) {
    this.refreshPlayerPresence(session)
    const revealReady = Boolean(session.revealReady)
    const hostPlayer = session.players.find((player) => player.isHost)
    const activeEntry = this.getCurrentEntry(session, { includeAnswer: session.status === 'playing', revealAnswer: revealReady || session.status === 'finished' })

    const payload = {
      sessionId: session.sessionId,
      code: session.code,
      status: toPublicStatus(session.status),
      category: session.category,
      game: session.game,
      gameCreatedBy: session.gameCreatedBy || '',
      createdBy: session.gameCreatedBy || '',
      entryCount: session.totalEntries,
      currentEntryIndex: session.currentEntry,
      currentEntry: activeEntry,
      totalEntries: session.totalEntries,
      startedAt: session.startedAt || null,
      hostName: hostPlayer ? hostPlayer.name : '',
      players: session.players.map((player) => ({
        playerId: player.playerId,
        name: player.name,
        isHost: player.isHost,
        connected: player.connected !== false,
        lastSeenAt: player.lastSeenAt || null,
        submitted: player.submitted,
        score: player.score,
        entryPoints: player.entryPoints,
        correct: player.correct,
        answer: player.answer,
      })),
      revealReady,
      correctAnswer: revealReady ? this.getEntryAnswer(session) : '',
      finalizedAt: session.finalizedAt || null,
      resultFileName: session.resultFileName || '',
    }

    if (viewerPlayer) {
      payload.playerToken = viewerPlayer.playerToken
      payload.me = {
        playerId: viewerPlayer.playerId,
        playerToken: viewerPlayer.playerToken,
        name: viewerPlayer.name,
        isHost: viewerPlayer.isHost,
        connected: viewerPlayer.connected !== false,
        lastSeenAt: viewerPlayer.lastSeenAt || null,
        submitted: viewerPlayer.submitted,
        score: viewerPlayer.score,
        entryPoints: viewerPlayer.entryPoints,
        correct: viewerPlayer.correct,
        answer: viewerPlayer.answer,
        currentAttempt: viewerPlayer.currentAttempt ?? 0,
        hintsUsed: viewerPlayer.hintsUsed ?? 0,
        guesses: Array.isArray(viewerPlayer.guesses) ? viewerPlayer.guesses : [],
      }
    }

    return payload
  }

  buildFinalSummary(session) {
    const hostPlayer = session.players.find((player) => player.isHost)
    const sortedPlayers = [...session.players]
      .sort((left, right) => {
        const scoreDelta = (right.score ?? 0) - (left.score ?? 0)
        if (scoreDelta !== 0) return scoreDelta
        return left.name.localeCompare(right.name)
      })

    const topScore = sortedPlayers[0]?.score ?? 0
    const winners = sortedPlayers.filter((player) => (player.score ?? 0) === topScore)
    const fileName = session.resultFileName || this.getResultFileName(session)

    return {
      sessionId: session.sessionId,
      code: session.code,
      category: session.category,
      game: session.game,
      hostName: hostPlayer?.name || '',
      status: toPublicStatus(session.status),
      totalEntries: session.totalEntries,
      startedAt: session.startedAt || null,
      finishedAt: session.finishedAt || null,
      finalizedAt: session.finalizedAt || null,
      resultFileName: fileName,
      entries: Array.isArray(session.scoreLog) ? session.scoreLog : [],
      winners: winners.map((player) => ({
        name: player.name,
        score: player.score ?? 0,
      })),
      players: sortedPlayers.map((player, index) => ({
        rank: index + 1,
        name: player.name,
        isHost: player.isHost,
        score: player.score ?? 0,
        correct: player.correct,
        entryPoints: player.entryPoints ?? 0,
        answer: player.answer || '',
      })),
    }
  }

  loadEntries(game, requestedCount) {
    if (!this.wordsService || typeof this.wordsService.get20RandomWordsWith5Clues !== 'function') {
      throw new Error('SessionsService requires a wordsService with get20RandomWordsWith5Clues.')
    }

    const targetCount = requestedCount === 0 ? Infinity : requestedCount
    const entriesByAnswer = new Map()
    let lastBatchSize = 0

    for (let attempt = 0; attempt < 10 && entriesByAnswer.size < targetCount; attempt += 1) {
      const result = this.wordsService.get20RandomWordsWith5Clues(game)
      const entries = Array.isArray(result)
        ? result
        : Array.isArray(result && result.data)
          ? result.data
          : []
      lastBatchSize = Math.max(lastBatchSize, entries.length)

      entries
        .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        .filter((entry) => typeof entry.answer === 'string' && entry.answer.trim())
        .forEach((entry) => {
          const normalized = normalizeAnswer(entry.answer)
          if (!entriesByAnswer.has(normalized)) {
            entriesByAnswer.set(normalized, entry)
          }
        })

      if (requestedCount === 0 && entries.length < lastBatchSize) {
        break
      }
    }

    const sanitized = Array.from(entriesByAnswer.values())

    if (sanitized.length === 0) {
      throw new HttpError(404, `No entries found for game "${game}".`)
    }

    const count = requestedCount === 0 ? sanitized.length : Math.min(requestedCount, sanitized.length)
    return sanitized.slice(0, count)
  }

  create(options = {}) {
    this.cleanupExpiredSessions()

    const nickname = validateNickname(options.nickname)
    const category = validateRequiredString(options.category, 'category')
    const game = validateRequiredString(options.game, 'game')
    const gameCreatedBy = validateRequiredString(options.gameCreatedBy ?? options.createdBy, 'gameCreatedBy')
    const entryCount = validateEntryCount(options.entryCount)
    const entries = this.loadEntries(game, entryCount)

    const session = {
      sessionId: this.createSessionId(),
      code: this.createUniqueCode(),
      category,
      game,
      gameCreatedBy,
      createdAt: new Date().toISOString(),
      status: 'lobby',
      currentEntry: 0,
      totalEntries: entries.length,
      startedAt: null,
      players: [createPlayer(nickname, true)],
      revealReady: false,
      entries,
      scoreLog: [],
      expiresAt: Date.now() + this.ttlMs,
    }

    this.sessionsById.set(session.sessionId, session)
    this.sessionIdsByCode.set(session.code, session.sessionId)
    this.updateActiveGameRecord(session)

    return this.toPublicSession(session, session.players[0])
  }

  list(options = {}) {
    this.cleanupExpiredSessions()

    const requestedStatus = String(options.status || '').trim().toLowerCase() || 'active'
    const participantFilter = String(options.nickname || '').trim().toLowerCase()

    if (requestedStatus !== 'active' && !VALID_LIST_STATUSES.has(requestedStatus)) {
      throw new HttpError(400, 'status must be one of lobby, playing, finished, all, or active.')
    }

    const persistedSessions = this.pruneStaleActiveGames(this.readActiveGames())
    const hostFilter = String(options.hostName || '').trim().toLowerCase()
    const liveSessionsById = new Map(
      Array.from(this.sessionsById.values()).map((session) => [session.sessionId, this.buildActiveGameRecord(session)])
    )
    const sessions = persistedSessions.map((session) => ({
      ...session,
      ...(liveSessionsById.get(session.sessionId) || {}),
    }))

    for (const [sessionId, liveSession] of liveSessionsById.entries()) {
      if (!sessions.some((session) => session.sessionId === sessionId)) {
        sessions.push(liveSession)
      }
    }

    return sessions
      .filter((session) => {
        if (hostFilter && `${session.hostName || ''}`.trim().toLowerCase() !== hostFilter) return false
        if (requestedStatus === 'all') return true

        const normalizedStatus = `${session.status || ''}`.trim().toLowerCase()
        const isLobby = normalizedStatus === toPublicStatus('lobby').toLowerCase()
        const isPlaying = normalizedStatus === toPublicStatus('playing').toLowerCase()
        const participantNames = Array.isArray(session.participantNames) ? session.participantNames : []
        const isParticipant = participantFilter
          ? participantNames.some((name) => `${name || ''}`.trim().toLowerCase() === participantFilter)
          : false

        if (requestedStatus === 'active') {
          if (session.active === false) return false
          if (isLobby) return true
          if (isPlaying) return isParticipant
          return false
        }

        const matchesRequestedStatus = normalizedStatus === toPublicStatus(requestedStatus).toLowerCase()
        if (!matchesRequestedStatus) return false
        if (isPlaying) return isParticipant
        return true
      })
      .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0))
      .map((session) => ({
        sessionId: session.sessionId,
        code: session.code,
        category: session.category,
        game: session.game,
        gameCreatedBy: session.gameCreatedBy || '',
        createdBy: session.gameCreatedBy || '',
        status: session.status,
        entryCount: session.totalEntries,
        currentEntryIndex: 0,
        currentEntry: 0,
        totalEntries: session.totalEntries,
        startedAt: session.startedAt || null,
        playerCount: session.playerCount ?? 0,
        hostName: session.hostName || '',
        revealReady: false,
        active: session.active !== false,
        deactivatedAt: session.deactivatedAt || null,
      }))
  }

  start(sessionId, options = {}) {
    const session = this.getSessionOrThrow(sessionId)
    this.touchSession(session)
    const player = this.resolvePlayer(session, options)

    if (!player || !player.isHost) {
      throw new HttpError(403, 'Only the host can start this session.')
    }

    if (session.status === 'playing' || session.status === 'finished') {
      throw new HttpError(409, session.status === 'playing'
        ? 'Session has already started.'
        : 'Session is not in a startable state.')
    }

    if (session.status !== 'lobby') {
      throw new HttpError(409, 'Session is not in a startable state.')
    }

    if (session.players.length < 2) {
      throw new HttpError(409, 'At least 2 players are required to start.')
    }

    session.status = 'playing'
    session.startedAt = new Date().toISOString()
    session.currentEntry = 0
    session.revealReady = false
    session.scoreLog = []
    session.finalSummary = null
    session.finalizedAt = null
    session.resultFileName = this.getResultFileName(session)
    session.resultFilePath = this.getResultFilePath(session)
    session.players.forEach((sessionPlayer) => {
      this.markPlayerPresence(session, sessionPlayer)
      sessionPlayer.submitted = false
      sessionPlayer.entryPoints = 0
      sessionPlayer.correct = false
      sessionPlayer.answer = ''
      sessionPlayer.currentAttempt = 0
      sessionPlayer.hintsUsed = 0
      sessionPlayer.guesses = []
    })

    this.persistScoreFile(session)
    this.updateActiveGameRecord(session)

    return this.toPublicSession(session, player)
  }

  join(options = {}) {
    this.cleanupExpiredSessions()

    const code = validateCode(options.code)
    const playerToken = normalizePlayerToken(options.playerToken ?? options.participantToken)
    const sessionId = this.sessionIdsByCode.get(code)

    if (!sessionId) {
      throw new HttpError(404, 'Session code not found.')
    }

    const session = this.getSessionOrThrow(sessionId)
    const existingPlayer = playerToken ? this.findPlayerByToken(session, playerToken) : null
    if (existingPlayer) {
      this.markPlayerPresence(session, existingPlayer)
      return this.toPublicSession(session, existingPlayer)
    }

    const nickname = validateNickname(options.nickname)
    this.touchSession(session)
    if (session.status !== 'lobby') {
      throw new HttpError(404, 'Session code not found or session is not joinable.')
    }

    if (this.isNicknameTaken(session, nickname)) {
      throw new HttpError(400, 'Nickname already taken.')
    }

    if (session.players.length >= MAX_PLAYERS) {
      throw new HttpError(400, 'Session full.')
    }

    const newPlayer = createPlayer(nickname, false)
    session.players.push(newPlayer)
    this.updateActiveGameRecord(session)
    return this.toPublicSession(session, newPlayer)
  }

  get(sessionId, options = {}) {
    const session = this.getSessionOrThrow(sessionId)
    const viewerPlayer = this.resolvePlayer(session, options, { required: false, allowNicknameFallback: true, markPresence: true })
    this.touchSession(session)
    return this.toPublicSession(session, viewerPlayer)
  }

  findPlayer(session, nickname) {
    const normalized = normalizeNickname(nickname).toLowerCase()
    return session.players.find((player) => player.name.toLowerCase() === normalized)
  }

  refreshRevealReady(session) {
    if (session.status === 'playing' && session.players.length > 0 && session.players.every((player) => player.submitted)) {
      session.revealReady = true
      return
    }

    session.revealReady = false
  }

  submit(sessionId, options = {}) {
    const session = this.getSessionOrThrow(sessionId)
    this.touchSession(session)

    if (session.status !== 'playing') {
      throw new HttpError(400, 'Session is not in playing status.')
    }

    const player = this.resolvePlayer(session, options)

    if (player.submitted) {
      return this.toPublicSession(session, player)
    }

    const hintsUsed = Number(options.hintsUsed)
    if (!Number.isInteger(hintsUsed) || hintsUsed < 0 || hintsUsed > 4) {
      throw new HttpError(400, 'hintsUsed must be an integer from 0 to 4.')
    }

    const answer = String(options.answer || '').trim()
    const isCorrect = normalizeAnswer(answer) === normalizeAnswer(this.getEntryAnswer(session))
    const entryPoints = isCorrect ? Math.max(5 - hintsUsed, 1) : 0

    player.submitted = true
    player.answer = answer
    player.correct = isCorrect
    player.entryPoints = entryPoints
    player.score += entryPoints
    player.currentAttempt = hintsUsed
    player.hintsUsed = hintsUsed
    player.guesses = this.sanitizeProgressGuesses(options.guesses, hintsUsed)
    if (!player.guesses[hintsUsed]) {
      player.guesses[hintsUsed] = answer
    }
    this.upsertScoreLog(session, player, session.currentEntry)
    this.persistScoreFile(session)

    this.refreshRevealReady(session)
    return this.toPublicSession(session, player)
  }

  progress(sessionId, options = {}) {
    const session = this.getSessionOrThrow(sessionId)
    this.touchSession(session)

    if (session.status !== 'playing') {
      throw new HttpError(400, 'Session is not in playing status.')
    }

    const player = this.resolvePlayer(session, options)
    if (player.submitted) {
      return this.toPublicSession(session, player)
    }

    const currentAttempt = Number(options.currentAttempt)
    if (!Number.isInteger(currentAttempt) || currentAttempt < 0 || currentAttempt > 4) {
      throw new HttpError(400, 'currentAttempt must be an integer from 0 to 4.')
    }

    player.currentAttempt = currentAttempt
    player.hintsUsed = currentAttempt
    player.guesses = this.sanitizeProgressGuesses(options.guesses, currentAttempt)
    return this.toPublicSession(session, player)
  }

  next(sessionId, options = {}) {
    const session = this.getSessionOrThrow(sessionId)
    this.touchSession(session)
    const player = this.resolvePlayer(session, options)

    if (!player || !player.isHost) {
      throw new HttpError(403, 'Caller is not the host.')
    }

    if (session.status === 'lobby') {
      session.status = 'playing'
      session.currentEntry = 0
    } else {
      session.currentEntry += 1
    }

    if (session.currentEntry >= session.totalEntries) {
      session.status = 'finished'
      session.currentEntry = session.totalEntries
      session.finishedAt = new Date().toISOString()
      this.persistScoreFile(session)
      this.updateActiveGameRecord(session, { active: false })
    }

    session.players.forEach((sessionPlayer) => {
      sessionPlayer.submitted = false
      sessionPlayer.entryPoints = 0
      sessionPlayer.correct = false
      sessionPlayer.answer = ''
      sessionPlayer.currentAttempt = 0
      sessionPlayer.hintsUsed = 0
      sessionPlayer.guesses = []
    })
    session.revealReady = false

    return this.toPublicSession(session, player)
  }

  finalize(sessionId, options = {}) {
    const session = this.getSessionOrThrow(sessionId)
    this.touchSession(session)
    this.resolvePlayer(session, options)

    if (session.status !== 'finished') {
      throw new HttpError(409, 'Session is not finished yet.')
    }

    if (session.finalSummary) {
      return session.finalSummary
    }

    const summary = this.buildFinalSummary(session)
    session.finalizedAt = new Date().toISOString()
    session.resultFileName = summary.resultFileName
    if (!session.resultFilePath) {
      session.resultFilePath = this.getResultFilePath(session)
    }
    const persisted = {
      ...this.buildScorePersistence(session),
      finalizedAt: session.finalizedAt,
      winners: summary.winners,
      players: summary.players,
    }
    fs.writeFileSync(session.resultFilePath, JSON.stringify(persisted, null, 2), 'utf8')
    session.finalSummary = {
      ...summary,
      finalizedAt: session.finalizedAt,
      filePath: session.resultFilePath,
    }

    return session.finalSummary
  }

  deactivate(sessionId, options = {}) {
    const session = this.getSessionOrThrow(sessionId)
    this.touchSession(session)
    const hostPlayer = this.resolvePlayer(session, options)

    if (!hostPlayer || !hostPlayer.isHost) {
      throw new HttpError(403, 'Only the host can deactivate this session.')
    }

    session.deactivatedAt = new Date().toISOString()
    this.updateActiveGameRecord(session, {
      active: false,
      deactivatedAt: session.deactivatedAt,
      status: 'Deactivated',
      sessionStatus: toPublicStatus(session.status),
    })

    return {
      sessionId: session.sessionId,
      code: session.code,
      active: false,
      deactivatedAt: session.deactivatedAt,
    }
  }

  leave(sessionId, options = {}) {
    const session = this.getSessionOrThrow(sessionId)
    this.touchSession(session)
    const player = this.resolvePlayer(session, options, { required: true, allowNicknameFallback: true, markPresence: false })
    const playerIndex = session.players.findIndex((sessionPlayer) => sessionPlayer.playerToken === player.playerToken)

    if (playerIndex === -1) {
      throw new HttpError(404, 'Player not found.')
    }

    const [removedPlayer] = session.players.splice(playerIndex, 1)
    if (session.players.length === 0) {
      this.sessionsById.delete(session.sessionId)
      this.sessionIdsByCode.delete(session.code)
      return {}
    }

    if (removedPlayer.isHost && !session.players.some((player) => player.isHost)) {
      session.players[0].isHost = true
    }

    this.refreshRevealReady(session)
    this.updateActiveGameRecord(session)
    return this.toPublicSession(session)
  }
}

module.exports = {
  SessionsService,
}
