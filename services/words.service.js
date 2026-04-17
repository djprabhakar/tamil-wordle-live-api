const fs = require('fs')
const path = require('path')

const { normalizeString, normalizeWord } = require('../utils/normalize')

const DEFAULT_DATA_FILE = path.join(__dirname, '..', 'data', 'common_500_words_with_5_clues.json')
const DEFAULT_CATEGORY_FILE_MAP = path.join(__dirname, '..', 'data', 'category-file-map.json')
const DEFAULT_CATEGORY_PROMPTS_DIR = path.join(__dirname, '..', 'data', 'category-prompts')
const DEFAULT_PROMPT_LOGS_DIR = path.join(__dirname, '..', 'data', 'prompt-logs')
const DEFAULT_STAGING_DIR = path.join(__dirname, '..', 'data', 'staging')
const DEFAULT_GAME_PROMPTS_DIR = path.join(__dirname, '..', 'data', 'game-prompts')
const DEFAULT_CATEGORY_FILE_SEED = {
  Common: {
    category: 'common',
    game_name: 'Common',
    file_name: 'common_500_words_with_5_clues.json',
    created_by: 'system',
  },
  "80's Rock Hits": {
    category: 'audio-songs',
    game_name: "80's Rock Hits",
    file_name: '80s_Rock_Hits.json',
    created_by: 'system',
  },
}

class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.details = details
  }
}

class WordsService {
  constructor(options = {}) {
    this.dataFilePath = options.dataFilePath || DEFAULT_DATA_FILE
    this.categoryFileMapPath = options.categoryFileMapPath || DEFAULT_CATEGORY_FILE_MAP
    this.categoryPromptsDir = options.categoryPromptsDir || DEFAULT_CATEGORY_PROMPTS_DIR
    this.promptLogsDir = options.promptLogsDir || DEFAULT_PROMPT_LOGS_DIR
    this.stagingDir = options.stagingDir || DEFAULT_STAGING_DIR
    this.gamePromptsDir = options.gamePromptsDir || DEFAULT_GAME_PROMPTS_DIR
    this.words = []
    this.wordMap = new Map()
    this.categoryMap = new Map()
    this.categories = []
    this.isLoaded = false
    this.create5HintGameJobs = new Map()
  }

  loadFromDisk() {
    let raw

    try {
      raw = fs.readFileSync(this.dataFilePath, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Words data file not found: ${this.dataFilePath}`)
      }

      throw new Error(`Unable to read words data file: ${error.message}`)
    }

    let parsed

    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`Malformed JSON in words data file: ${error.message}`)
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Words data file must contain a top-level array.')
    }

    const nextWords = []
    const nextWordMap = new Map()
    const nextCategoryMap = new Map()

    parsed.forEach((item, index) => {
      const validated = this.validateWordEntry(item, index)
      const normalizedWord = normalizeWord(validated.answer)

      if (nextWordMap.has(normalizedWord)) {
        throw new Error(
          `Duplicate normalized word "${normalizedWord}" found in words data file at index ${index}.`
        )
      }

      const normalizedCategory = normalizeString(validated.title)
      const record = {
        answer: validated.answer.trim(),
        title: validated.title.trim(),
        clues: validated.clues.map((clue) => clue.trim()),
        normalizedWord,
        normalizedCategory,
      }

      nextWords.push(record)
      nextWordMap.set(normalizedWord, record)

      if (!nextCategoryMap.has(normalizedCategory)) {
        nextCategoryMap.set(normalizedCategory, [])
      }

      nextCategoryMap.get(normalizedCategory).push(record)
    })

    this.words = nextWords
    this.wordMap = nextWordMap
    this.categoryMap = nextCategoryMap
    this.categories = Array.from(nextCategoryMap.values())
      .map((records) => records[0].title)
      .sort((left, right) => left.localeCompare(right))
    this.isLoaded = true
  }

  validateWordEntry(item, index) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid entry at index ${index}: expected an object.`)
    }

    const answer = typeof item.answer === 'string'
      ? item.answer
      : typeof item.word === 'string'
        ? item.word
        : ''
    const title = typeof item.title === 'string'
      ? item.title
      : typeof item.category === 'string'
        ? item.category
        : ''
    const clues = item.clues

    if (!answer.trim()) {
      throw new Error(`Invalid entry at index ${index}: "answer" must be a non-empty string.`)
    }

    if (!title.trim()) {
      throw new Error(`Invalid entry at index ${index}: "title" must be a non-empty string.`)
    }

    if (!Array.isArray(clues) || clues.length !== 5) {
      throw new Error(`Invalid entry at index ${index}: "clues" must be an array of exactly 5 items.`)
    }

    clues.forEach((clue, clueIndex) => {
      if (typeof clue !== 'string' || !clue.trim()) {
        throw new Error(
          `Invalid entry at index ${index}: clue ${clueIndex} must be a non-empty string.`
        )
      }
    })

    return { answer, title, clues }
  }

  ensureLoaded() {
    if (!this.isLoaded) {
      throw new Error('Words service was used before data finished loading.')
    }
  }

  sanitizeWord(record) {
    return {
      answer: record.answer,
      title: record.title,
      clues: record.clues,
    }
  }

  getCategories() {
    this.ensureLoaded()
    return this.categories
  }

  getByWord(word) {
    this.ensureLoaded()

    const normalized = normalizeWord(word)
    if (!normalized) {
      throw new HttpError(400, 'Word parameter is required.')
    }

    const record = this.wordMap.get(normalized)

    if (!record) {
      throw new HttpError(404, `Word "${String(word || '').trim()}" was not found.`)
    }

    return this.sanitizeWord(record)
  }

  checkWord(guess) {
    this.ensureLoaded()

    const normalized = normalizeWord(guess)
    if (!normalized) {
      return { exists: false }
    }

    const record = this.wordMap.get(normalized)

    if (!record) {
      return { exists: false }
    }

    return {
      exists: true,
      answer: record.answer,
      title: record.title,
    }
  }

  getRandomWord(category) {
    this.ensureLoaded()

    const source = this.getRecordsByCategory(category)

    if (source.length === 0) {
      if (category) {
        throw new HttpError(404, `No words found for category "${String(category).trim()}".`)
      }

      throw new HttpError(404, 'No words available.')
    }

    const index = Math.floor(Math.random() * source.length)
    return this.sanitizeWord(source[index])
  }

  getRandomSet(options = {}) {
    this.ensureLoaded()

    const count = Number(options.count)
    if (!Number.isInteger(count) || count < 1) {
      throw new HttpError(400, 'Query parameter "count" must be a positive integer.')
    }

    const source = this.getRecordsByCategory(options.category)
    if (source.length === 0) {
      throw new HttpError(404, `No words found for category "${String(options.category || '').trim()}".`)
    }

    if (count > source.length) {
      throw new HttpError(
        400,
        `Requested count ${count} exceeds the available words (${source.length}) for the selected filter.`
      )
    }

    return this.sampleWithoutReplacement(source, count).map((record) => this.sanitizeWord(record))
  }

  getAll(options = {}) {
    this.ensureLoaded()

    const records = this.getRecordsByCategory(options.category)
    if (records.length === 0) {
      throw new HttpError(404, `No words found for category "${String(options.category || '').trim()}".`)
    }

    let working = records.slice()

    if (options.shuffle) {
      working = this.shuffle(working)
    }

    const total = working.length
    const limit = options.limit
    const page = options.page

    if (typeof limit === 'number') {
      const safePage = typeof page === 'number' ? page : 1
      const startIndex = (safePage - 1) * limit
      working = working.slice(startIndex, startIndex + limit)

      return {
        data: working.map((record) => this.sanitizeWord(record)),
        pagination: {
          page: safePage,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }
    }

    return {
      data: working.map((record) => this.sanitizeWord(record)),
      pagination: null,
    }
  }

  getRecordsByCategory(category) {
    if (!category) {
      return this.words
    }

    const normalizedCategory = normalizeString(category)
    if (!normalizedCategory) {
      throw new HttpError(400, 'Query parameter "category" must be a non-empty string when provided.')
    }

    return this.categoryMap.get(normalizedCategory) || []
  }

  shuffle(records) {
    const copy = records.slice()

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1))
      const temp = copy[index]
      copy[index] = copy[randomIndex]
      copy[randomIndex] = temp
    }

    return copy
  }

  sampleWithoutReplacement(records, count) {
    return this.shuffle(records).slice(0, count)
  }

  ensureCategoryFileMap() {
    if (!fs.existsSync(this.categoryFileMapPath)) {
      fs.writeFileSync(`${this.categoryFileMapPath}`, `${JSON.stringify(DEFAULT_CATEGORY_FILE_SEED, null, 2)}\n`, 'utf8')
    }
  }

  readCategoryFileMap() {
    this.ensureCategoryFileMap()

    let parsed

    try {
      parsed = JSON.parse(fs.readFileSync(this.categoryFileMapPath, 'utf8'))
    } catch (error) {
      throw new Error(`Malformed JSON in category file map: ${error.message}`)
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Category file map must contain a top-level object.')
    }

    const normalizedMap = {}

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        normalizedMap[key] = {
          category: 'audio-songs',
          game_name: key,
          file_name: value,
          created_by: 'system',
          state: 'published',
        }
        continue
      }

      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Category file map entry "${key}" must be a string or object.`)
      }

      const categoryName = typeof value.category === 'string' && value.category.trim()
        ? value.category.trim()
        : 'audio-songs'
      const gameName = typeof value.game_name === 'string' && value.game_name.trim()
        ? value.game_name.trim()
        : key
      const fileName = typeof value.file_name === 'string' && value.file_name.trim()
        ? value.file_name.trim()
        : typeof value.fileName === 'string' && value.fileName.trim()
          ? value.fileName.trim()
          : ''

      if (!fileName) {
        throw new Error(`Category file map entry "${key}" must contain a non-empty "file_name".`)
      }

      normalizedMap[key] = {
        category: categoryName,
        game_name: gameName,
        file_name: fileName,
        created_by: typeof value.created_by === 'string' && value.created_by.trim()
          ? value.created_by.trim()
          : 'system',
        state: typeof value.state === 'string' && value.state.trim()
          ? value.state.trim()
          : 'published',
      }
    }

    return normalizedMap
  }

  writeCategoryFileMap(fileMap) {
    fs.writeFileSync(`${this.categoryFileMapPath}`, `${JSON.stringify(fileMap, null, 2)}\n`, 'utf8')
  }

  deriveFileNameFromCategory(category) {
    const cleaned = String(category || '')
      .trim()
      .replace(/'/g, '')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()

    if (!cleaned) {
      throw new HttpError(400, 'Category is required.')
    }

    const fileName = cleaned
      .split(/\s+/)
      .map((token) => {
        if (/^\d/.test(token)) {
          return token
        }

        return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
      })
      .join('_')

    return `${fileName}.json`
  }

  getCategoryFileInfo(category, options = {}) {
    const normalizedCategory = normalizeString(category)
    if (!normalizedCategory) {
      throw new HttpError(400, 'Category is required.')
    }

    const fileMap = this.readCategoryFileMap()
    const existingCategory = Object.entries(fileMap).find(([key, value]) => (
      normalizeString(key) === normalizedCategory
      || normalizeString(value?.game_name) === normalizedCategory
    ))

    if (existingCategory) {
      const [existingKey, existingValue] = existingCategory
      return {
        category: existingValue.category,
        gameName: existingValue.game_name,
        fileName: existingValue.file_name,
        createdBy: existingValue.created_by,
        state: existingValue.state,
        isNew: false,
        mapKey: existingKey,
        fileMap,
      }
    }

    if (!options.createIfMissing) {
      throw new HttpError(404, `Game "${String(category).trim()}" was not found.`)
    }

    const derivedFileName = this.deriveFileNameFromCategory(category)
    fileMap[String(category).trim()] = {
      category: String(options.categoryType || 'audio-songs').trim() || 'audio-songs',
      game_name: String(category).trim(),
      file_name: derivedFileName,
      created_by: String(options.createdBy || 'system').trim() || 'system',
      state: 'staging',
    }
    this.writeCategoryFileMap(fileMap)

    const filePath = path.join(path.dirname(this.categoryFileMapPath), derivedFileName)
    if (!options.skipDataFileCreate && !fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]\n', 'utf8')
    }

    return {
      category: fileMap[String(category).trim()].category,
      gameName: fileMap[String(category).trim()].game_name,
      fileName: derivedFileName,
      createdBy: fileMap[String(category).trim()].created_by,
      state: fileMap[String(category).trim()].state,
      isNew: true,
      fileMap,
    }
  }

  readCategoryEntries(category, options = {}) {
    const info = this.getCategoryFileInfo(category, options)
    const filePath = path.join(path.dirname(this.categoryFileMapPath), info.fileName)

    let parsed

    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
      throw new Error(`Malformed JSON in category data file "${info.fileName}": ${error.message}`)
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Category data file "${info.fileName}" must contain a top-level array.`)
    }

    return {
      ...info,
      filePath,
      entries: parsed,
    }
  }

  readExistingCategoryEntries(fileName) {
    const filePath = path.join(path.dirname(this.categoryFileMapPath), fileName)
    if (!fs.existsSync(filePath)) {
      return []
    }

    let parsed

    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
      throw new Error(`Malformed JSON in category data file "${fileName}": ${error.message}`)
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Category data file "${fileName}" must contain a top-level array.`)
    }

    return parsed
  }

  writeCategoryEntries(filePath, entries) {
    fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
  }

  ensureCategoryPromptsDir() {
    fs.mkdirSync(this.categoryPromptsDir, { recursive: true })
  }

  ensurePromptLogsDir() {
    fs.mkdirSync(this.promptLogsDir, { recursive: true })
  }

  ensureGamePromptsDir() {
    fs.mkdirSync(this.gamePromptsDir, { recursive: true })
  }

  ensureStagingDir() {
    fs.mkdirSync(this.stagingDir, { recursive: true })
  }

  getStagingFilePath(fileName) {
    this.ensureStagingDir()
    const parsed = path.parse(fileName)
    return path.join(this.stagingDir, `${parsed.name}_staging${parsed.ext || '.json'}`)
  }

  readStagingEntries(fileName) {
    const stagingFilePath = this.getStagingFilePath(fileName)
    if (!fs.existsSync(stagingFilePath)) {
      fs.writeFileSync(stagingFilePath, '[]\n', 'utf8')
      return {
        stagingFilePath,
        entries: [],
      }
    }

    let parsed

    try {
      parsed = JSON.parse(fs.readFileSync(stagingFilePath, 'utf8'))
    } catch (error) {
      throw new Error(`Malformed JSON in staging data file "${path.basename(stagingFilePath)}": ${error.message}`)
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Staging data file "${path.basename(stagingFilePath)}" must contain a top-level array.`)
    }

    return {
      stagingFilePath,
      entries: parsed,
    }
  }

  getPromptFilePath(fileName) {
    return path.join(this.categoryPromptsDir, fileName.replace(/\.json$/i, '.prompt.json'))
  }

  getGamePromptsFilePath(fileName) {
    this.ensureGamePromptsDir()
    const parsed = path.parse(fileName)
    return path.join(this.gamePromptsDir, `${parsed.name}_prompts.json`)
  }

  readGamePromptEntries(fileName) {
    const gamePromptsFilePath = this.getGamePromptsFilePath(fileName)
    if (!fs.existsSync(gamePromptsFilePath)) {
      fs.writeFileSync(gamePromptsFilePath, '[]\n', 'utf8')
      return {
        gamePromptsFilePath,
        entries: [],
      }
    }

    let parsed

    try {
      parsed = JSON.parse(fs.readFileSync(gamePromptsFilePath, 'utf8'))
    } catch (error) {
      throw new Error(`Malformed JSON in game prompts file "${path.basename(gamePromptsFilePath)}": ${error.message}`)
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Game prompts file "${path.basename(gamePromptsFilePath)}" must contain a top-level array.`)
    }

    return {
      gamePromptsFilePath,
      entries: parsed,
    }
  }

  createDefaultPromptConfig(category) {
    return {
      category,
      version: 2,
      promptTemplate: 'Generate {{NoOfWords}} distinct entries for the category "{{CategoryName}}". The server will request them one at a time until {{NoOfWords}} entries are created. Return a single JSON object only for each request. Always include answer, category, game_name, title, and clues. The generated entry category value must be "{{EntryCategory}}". The generated entry game_name value must be "{{GameName}}". {{MetaInstruction}} Use this overall game guidance when shaping the entry: {{GamePrompt}} Use this as a direct instruction for generating the title: {{TitlePrompt}} Use this as rules and guidelines for generating the 5 clues: {{CluesPrompt}} The title must not reveal the answer directly. The clues array must contain exactly 5 clue nodes. Each clue node must contain text with the clue text and is_confirmed with the value "No". {{CategorySpecificRules}} {{AudioInstruction}} {{DuplicateAvoidanceInstruction}} Existing answers to avoid: {{ExistingAnswersInstruction}} Generated entry id must be omitted. The server will assign ids. Set created_by to "{{NickName}}" will be handled by the server. Do not include explanation text outside the JSON object.',
    }
  }

  ensureCategoryPromptFile(category, fileName) {
    this.ensureCategoryPromptsDir()
    const promptFilePath = this.getPromptFilePath(fileName)

    if (!fs.existsSync(promptFilePath)) {
      fs.writeFileSync(
        promptFilePath,
        `${JSON.stringify(this.createDefaultPromptConfig(category), null, 2)}\n`,
        'utf8'
      )
    }

    return promptFilePath
  }

  readCategoryPromptConfig(category, fileName) {
    const promptFilePath = this.ensureCategoryPromptFile(category, fileName)

    let parsed

    try {
      parsed = JSON.parse(fs.readFileSync(promptFilePath, 'utf8'))
    } catch (error) {
      throw new Error(`Malformed JSON in category prompt file "${path.basename(promptFilePath)}": ${error.message}`)
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Category prompt file "${path.basename(promptFilePath)}" must contain a top-level object.`)
    }

    return {
      promptFilePath,
      promptConfig: parsed,
    }
  }

  renderPromptTemplate(template, variables) {
    return String(template || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      if (!(key in variables)) {
        return ''
      }

      return String(variables[key])
    })
  }

  buildDuplicateAvoidanceInstruction() {
    return 'Duplicate avoidance is mandatory. Before returning JSON, normalize the candidate answer by trimming leading and trailing whitespace and converting it to lowercase, then compare it against every answer in the avoid list and every answer already generated in this batch. If the normalized form matches any existing answer, discard it and choose a completely different answer. Do not return the same answer twice, and do not return casing variants, whitespace variants, or near-identical repeats of an existing answer.'
  }

  toSafeSlug(value) {
    const safeValue = String(value || '').trim().toLowerCase()
    return safeValue.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
  }

  writePromptLog(jobId, gameName, entryIndex, attemptIndex, promptText) {
    this.ensurePromptLogsDir()
    const safeJobId = this.toSafeSlug(jobId)
    const safeGameName = this.toSafeSlug(gameName)
    const fileName = `${safeJobId}-${safeGameName}-entry-${entryIndex}-attempt-${attemptIndex}.prompt.txt`
    const filePath = path.join(this.promptLogsDir, fileName)
    fs.writeFileSync(filePath, `${String(promptText || '')}\n`, 'utf8')
    return filePath
  }

  writeGamePromptEntries(filePath, entries) {
    fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
  }

  getExistingAnswers(entries) {
    return entries
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      .map((entry) => (typeof entry.answer === 'string' ? entry.answer.trim() : ''))
      .filter(Boolean)
  }

  getCreate5HintGameEnvironment() {
    const checks = []
    const openAiApiKey = String(process.env.OPENAI_API_KEY || '').trim()
    const openAiModel = String(process.env.OPENAI_MODEL || '').trim()

    checks.push({
      name: 'OPENAI_API_KEY',
      ok: Boolean(openAiApiKey),
      message: openAiApiKey ? 'Configured.' : 'Missing required environment variable.',
    })

    checks.push({
      name: 'OPENAI_MODEL',
      ok: true,
      message: openAiModel ? `Configured as "${openAiModel}".` : 'Not set. The default model "gpt-5" will be used.',
    })

    try {
      require.resolve('openai')
      checks.push({
        name: 'openai package',
        ok: true,
        message: 'Installed.',
      })
    } catch (error) {
      checks.push({
        name: 'openai package',
        ok: false,
        message: `Not available: ${error.message}`,
      })
    }

    try {
      this.ensureCategoryPromptsDir()
      fs.accessSync(this.categoryPromptsDir, fs.constants.R_OK | fs.constants.W_OK)
      checks.push({
        name: 'category prompts directory',
        ok: true,
        message: `Readable and writable: ${this.categoryPromptsDir}`,
      })
    } catch (error) {
      checks.push({
        name: 'category prompts directory',
        ok: false,
        message: `Not accessible: ${error.message}`,
      })
    }

    try {
      const dataDir = path.dirname(this.categoryFileMapPath)
      fs.mkdirSync(dataDir, { recursive: true })
      fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK)
      checks.push({
        name: 'data directory',
        ok: true,
        message: `Readable and writable: ${dataDir}`,
      })
    } catch (error) {
      checks.push({
        name: 'data directory',
        ok: false,
        message: `Not accessible: ${error.message}`,
      })
    }

    try {
      this.ensureStagingDir()
      fs.accessSync(this.stagingDir, fs.constants.R_OK | fs.constants.W_OK)
      checks.push({
        name: 'staging directory',
        ok: true,
        message: `Readable and writable: ${this.stagingDir}`,
      })
    } catch (error) {
      checks.push({
        name: 'staging directory',
        ok: false,
        message: `Not accessible: ${error.message}`,
      })
    }

    try {
      this.ensureGamePromptsDir()
      fs.accessSync(this.gamePromptsDir, fs.constants.R_OK | fs.constants.W_OK)
      checks.push({
        name: 'game prompts directory',
        ok: true,
        message: `Readable and writable: ${this.gamePromptsDir}`,
      })
    } catch (error) {
      checks.push({
        name: 'game prompts directory',
        ok: false,
        message: `Not accessible: ${error.message}`,
      })
    }

    return {
      ok: checks.every((check) => check.ok),
      checks,
    }
  }

  assertCreate5HintGameEnvironment() {
    const result = this.getCreate5HintGameEnvironment()
    if (!result.ok) {
      throw new HttpError(500, 'Create5HintGame environment is not ready.', { checks: result.checks })
    }
  }

  getNextEntryId(entries) {
    return entries.reduce((maxId, entry) => {
      const id = Number(entry && entry.id)
      if (!Number.isInteger(id) || id < 1) {
        return maxId
      }

      return Math.max(maxId, id)
    }, 0) + 1
  }

  createJobId() {
    return `J${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
  }

  parseCreate5HintNotes(notes) {
    if (notes === undefined) {
      return {
        noOfWords: 1,
        gamePrompt: '',
        titlePrompt: '',
        cluesPrompt: '',
        audioPrompt: '',
      }
    }

    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) {
      throw new HttpError(400, 'notes must be a JSON object.')
    }

    const rawNoOfWords = notes.NoOfWords
    const noOfWords = rawNoOfWords === undefined ? 1 : Number(rawNoOfWords)
    if (!Number.isInteger(noOfWords) || noOfWords < 1 || noOfWords > 20) {
      throw new HttpError(400, 'notes.NoOfWords must be an integer between 1 and 20.')
    }

    const gamePrompt = typeof notes.GamePrompt === 'string' ? notes.GamePrompt.trim() : ''
    const titlePrompt = typeof notes.TitlePrompt === 'string' ? notes.TitlePrompt.trim() : ''
    const cluesPrompt = typeof notes.CluesPrompt === 'string' ? notes.CluesPrompt.trim() : ''
    const audioPrompt = typeof notes.AudioPrompt === 'string' ? notes.AudioPrompt.trim() : ''

    return {
      noOfWords,
      gamePrompt,
      titlePrompt,
      cluesPrompt,
      audioPrompt,
    }
  }

  sanitizeCategoryWordEntry(entry, fallbackCategory) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new HttpError(400, 'WordEntry must be a JSON object.')
    }

    const answer = typeof entry.answer === 'string' ? entry.answer.trim() : ''
    if (!answer) {
      throw new HttpError(400, 'WordEntry must contain a non-empty "answer" string.')
    }

    if (!Array.isArray(entry.clues)) {
      throw new HttpError(400, 'WordEntry must contain a "clues" array.')
    }

    if (entry.clues.length !== 5) {
      throw new HttpError(400, 'WordEntry "clues" must contain exactly 5 items.')
    }

    const clues = entry.clues.map((clue, index) => {
      if (typeof clue !== 'string' || !clue.trim()) {
        throw new HttpError(400, `WordEntry clues[${index}] must be a non-empty string.`)
      }

      return clue.trim()
    })

    const normalizedEntry = { ...entry }
    delete normalizedEntry.word
    delete normalizedEntry.titleHint
    delete normalizedEntry.audio

    const title = typeof entry.title === 'string'
      ? entry.title.trim()
      : typeof entry.titleHint === 'string'
        ? entry.titleHint.trim()
        : ''

    let meta
    if (entry.meta && typeof entry.meta === 'object' && !Array.isArray(entry.meta)) {
      meta = { ...entry.meta }

      if (typeof meta.artist === 'string') {
        meta.artist = meta.artist.trim()
      }

      if (meta.year !== undefined) {
        meta.year = Number(meta.year)
      }
    }

    const sourceMedia = entry.media && typeof entry.media === 'object' && !Array.isArray(entry.media)
      ? entry.media
      : entry.audio && typeof entry.audio === 'object' && !Array.isArray(entry.audio)
        ? entry.audio
        : null

    let media
    if (sourceMedia) {
      media = { ...sourceMedia }

      if (typeof media.type === 'string') {
        media.type = media.type.trim()
      }

      if (typeof media.videoId === 'string') {
        media.videoId = media.videoId.trim()
      }

      if (media.start !== undefined) {
        media.start = Number(media.start)
      }

      if (media.duration !== undefined) {
        media.duration = Number(media.duration)
      }
    }
    const gameName = typeof entry.game_name === 'string' && entry.game_name.trim()
      ? entry.game_name.trim()
      : ''
    const category = typeof entry.category === 'string' && entry.category.trim()
      ? entry.category.trim()
      : String(fallbackCategory || '').trim()

    const orderedEntry = {
      ...('id' in normalizedEntry ? { id: normalizedEntry.id } : {}),
      category,
      ...(gameName ? { game_name: gameName } : {}),
      answer,
      ...(meta ? { meta } : {}),
      ...(title ? { title } : {}),
      clues,
      ...(media ? { media } : {}),
    }

    for (const [key, value] of Object.entries(normalizedEntry)) {
      if (['id', 'category', 'game_name', 'answer', 'meta', 'title', 'clues', 'media'].includes(key)) {
        continue
      }
      orderedEntry[key] = value
    }

    return orderedEntry
  }

  sanitizeGenerated5HintEntry(entry, fallbackCategory) {
    const sanitizedEntry = this.sanitizeCategoryWordEntry(
      {
        ...entry,
        clues: Array.isArray(entry?.clues)
          ? entry.clues.map((clue) => {
            if (clue && typeof clue === 'object' && !Array.isArray(clue)) {
              return clue.text
            }

            return clue
          })
          : entry?.clues,
      },
      fallbackCategory
    )

    const clueNodes = entry.clues.map((clue, index) => {
      const text = clue && typeof clue === 'object' && !Array.isArray(clue)
        ? String(clue.text || '').trim()
        : sanitizedEntry.clues[index]

      return {
        text,
        is_confirmed: 'No',
      }
    })

    return {
      ...sanitizedEntry,
      clues: clueNodes,
    }
  }

  sanitizeApproved5HintEntry(entry, fallbackCategory) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new HttpError(400, 'entry_json must be a JSON object.')
    }

    return this.sanitizeCategoryWordEntry(
      {
        ...entry,
        clues: Array.isArray(entry.clues)
          ? entry.clues.map((clue) => {
            if (clue && typeof clue === 'object' && !Array.isArray(clue)) {
              return clue.text
            }

            return clue
          })
          : entry.clues,
      },
      fallbackCategory
    )
  }

  saveA5HintWord(category, wordEntry) {
    const safeCategory = String(category || '').trim()
    if (!safeCategory) {
      throw new HttpError(400, 'Category is required.')
    }

    const sanitizedEntry = this.sanitizeCategoryWordEntry(wordEntry, safeCategory)
    const { category: resolvedCategory, gameName: resolvedGameName, fileName, filePath, entries } = this.readCategoryEntries(safeCategory, {
      createIfMissing: true,
      createdBy: typeof sanitizedEntry.created_by === 'string' ? sanitizedEntry.created_by : 'system',
      categoryType: typeof sanitizedEntry.category === 'string' ? sanitizedEntry.category : undefined,
    })

    entries.push(sanitizedEntry)
    this.writeCategoryEntries(filePath, entries)

    return {
      category: resolvedGameName,
      fileName,
      saved: sanitizedEntry,
      totalEntries: entries.length,
    }
  }

  getCreate5HintGameJob(jobId) {
    const safeJobId = String(jobId || '').trim().toUpperCase()
    if (!safeJobId) {
      throw new HttpError(400, 'jobId is required.')
    }

    const job = this.create5HintGameJobs.get(safeJobId)
    if (!job) {
      throw new HttpError(404, `Create5HintGame job "${safeJobId}" was not found.`)
    }

    return { ...job }
  }

  create5HintGame(options = {}) {
    const categoryType = String(options.category || '').trim()
    const gameName = String(options.gameName || options.game_name || options.categoryName || '').trim()
      || (categoryType && categoryType !== 'audio-songs' ? categoryType : '')
    const nickName = String(options.nickName || options.nick_name || '').trim()

    if (!categoryType) {
      throw new HttpError(400, 'category is required.')
    }

    if (!gameName) {
      throw new HttpError(400, 'game_name is required.')
    }

    if (!nickName) {
      throw new HttpError(400, 'nick_name is required.')
    }

    const jobId = this.createJobId()
    const queuedAt = Date.now()
    const job = {
      jobId,
      status: 'queued',
      category: categoryType,
      game_name: gameName,
      nick_name: nickName,
      queuedAt,
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null,
    }

    this.create5HintGameJobs.set(jobId, job)

    setImmediate(async () => {
      job.status = 'running'
      job.startedAt = Date.now()

      try {
        const result = await this.create5HintGameInternal({
          ...options,
          jobId,
        })
        job.status = 'completed'
        job.result = result
      } catch (error) {
        job.status = 'failed'
        job.error = {
          message: error instanceof HttpError ? error.message : 'Internal server error.',
          details: error instanceof HttpError ? error.details || null : { reason: error.message },
          statusCode: error instanceof HttpError ? error.statusCode : 500,
        }
      } finally {
        job.finishedAt = Date.now()
      }
    })

    return {
      jobId,
      status: job.status,
      category: categoryType,
      game_name: gameName,
      nick_name: nickName,
      queuedAt,
      statusUrl: `/api/words/Create5HintGameJobs/${jobId}`,
    }
  }

  async create5HintGameInternal(options = {}) {
    const categoryType = String(options.category || '').trim()
    const gameName = String(options.gameName || options.game_name || options.categoryName || '').trim()
      || (categoryType && categoryType !== 'audio-songs' ? categoryType : '')
    const nickName = String(options.nickName || options.nick_name || '').trim()
    const jobId = String(options.jobId || '').trim()
    const notes = this.parseCreate5HintNotes(options.notes)
    const audioEnabled = options.audioEnabled === true || options.audio_enabled === true

    if (!categoryType) {
      throw new HttpError(400, 'category is required.')
    }

    if (!gameName) {
      throw new HttpError(400, 'game_name is required.')
    }

    if (!nickName) {
      throw new HttpError(400, 'nick_name is required.')
    }

    if (!jobId) {
      throw new HttpError(400, 'jobId is required.')
    }

    this.assertCreate5HintGameEnvironment()

    let OpenAI
    try {
      OpenAI = require('openai')
    } catch (error) {
      throw new HttpError(500, 'OpenAI SDK is not installed.', {
        reason: error.message,
      })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const { category: resolvedCategory, gameName: resolvedGameName, fileName } = this.getCategoryFileInfo(gameName, {
      createIfMissing: true,
      createdBy: nickName,
      categoryType,
      skipDataFileCreate: true,
    })
    const entries = this.readExistingCategoryEntries(fileName)
    const { stagingFilePath, entries: stagingEntries } = this.readStagingEntries(fileName)
    const { promptFilePath, promptConfig } = this.readCategoryPromptConfig(resolvedGameName, fileName)
    const { gamePromptsFilePath, entries: gamePromptEntries } = this.readGamePromptEntries(fileName)
    let nextId = this.getNextEntryId([...entries, ...stagingEntries])
    const existingAnswerMap = new Map()
    for (const answer of this.getExistingAnswers([...entries, ...stagingEntries])) {
      existingAnswerMap.set(normalizeWord(answer), answer)
    }
    const existingAnswers = new Set(existingAnswerMap.keys())

    const baseSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        answer: { type: 'string' },
        category: { type: 'string' },
        game_name: { type: 'string' },
        title: { type: 'string' },
        clues: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: { type: 'string' },
              is_confirmed: { type: 'string', enum: ['No'] },
            },
            required: ['text', 'is_confirmed'],
          },
          minItems: 5,
          maxItems: 5,
        },
      },
      required: ['answer', 'category', 'game_name', 'title', 'clues'],
    }

    const schema = audioEnabled
      ? {
        ...baseSchema,
        properties: {
          ...baseSchema.properties,
          media: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string' },
              videoId: { type: 'string' },
              start: { type: 'integer' },
              duration: { type: 'integer' },
            },
            required: ['type', 'videoId', 'start', 'duration'],
          },
        },
        required: [...baseSchema.required, 'media'],
      }
      : baseSchema

    const defaultTemplate = this.createDefaultPromptConfig(resolvedGameName).promptTemplate
    const promptTemplate = typeof promptConfig.promptTemplate === 'string' && promptConfig.promptTemplate.trim()
      ? promptConfig.promptTemplate
      : defaultTemplate

    const baseAudioInstruction = 'After the clues section, include a media object with type, videoId, start, and duration.'
    const defaultAudioSearchInstruction = 'Search YouTube for karaoke videos of the answer and retrieve the YouTube videoId from the best fitting karaoke result.'
    const audioSearchInstruction = notes.audioPrompt ? notes.audioPrompt : defaultAudioSearchInstruction

    const templateVariables = {
      NoOfWords: notes.noOfWords,
      CategoryName: resolvedGameName,
      EntryCategory: categoryType,
      GameName: resolvedGameName,
      NickName: nickName,
      GamePrompt: notes.gamePrompt || 'Keep the overall game coherent, recognizable, and fun to solve without revealing the answer too directly.',
      TitlePrompt: notes.titlePrompt || 'Generate a concise teaser sentence for the title.',
      CluesPrompt: notes.cluesPrompt || 'Generate 5 clues from broad to specific.',
      DuplicateAvoidanceInstruction: this.buildDuplicateAvoidanceInstruction(),
      MetaInstruction: '',
      ExistingAnswersInstruction: existingAnswers.size > 0
        ? Array.from(existingAnswerMap.values()).join(' | ')
        : 'None yet.',
      CategorySpecificRules: resolvedGameName === "80's Rock Hits"
        ? 'The answer should be the song title only, not the artist name. Mention the artist or era in the title without revealing the answer directly. Write clues that move from broad cultural context to more identifying specifics.'
        : resolvedGameName === 'Contemporary  Hits'
          ? 'The answer should be the song title only, not the artist name. Prefer globally recognizable songs from the modern streaming era unless the request narrows the scope.'
          : 'Choose a familiar everyday word or phrase that is broadly recognizable. Order the clues from broader and easier to more specific.',
      AudioInstruction: audioEnabled
        ? `${baseAudioInstruction} ${audioSearchInstruction}`
        : 'Do not include a media object.',
    }
    const created = []
    const promptLogs = []
    const gamePromptFile = path.basename(gamePromptsFilePath)

    for (let index = 0; index < notes.noOfWords; index += 1) {
      let finalEntry = null

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const renderedPrompt = this.renderPromptTemplate(promptTemplate, {
          ...templateVariables,
          ExistingAnswersInstruction: existingAnswers.size > 0
            ? Array.from(existingAnswerMap.values()).join(' | ')
            : 'None yet.',
        })
        const promptLogPath = this.writePromptLog(
          jobId,
          resolvedGameName,
          index + 1,
          attempt + 1,
          renderedPrompt
        )
        promptLogs.push(promptLogPath)
        gamePromptEntries.push({
          job_id: jobId,
          category: categoryType,
          game_name: resolvedGameName,
          entry_index: index + 1,
          attempt_index: attempt + 1,
          game_prompt: notes.gamePrompt,
          title_prompt: notes.titlePrompt,
          clues_prompt: notes.cluesPrompt,
          audio_prompt: notes.audioPrompt,
          prompt: renderedPrompt,
          created_at: new Date().toISOString(),
        })
        this.writeGamePromptEntries(gamePromptsFilePath, gamePromptEntries)

        let response
        try {
          response = await client.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-5',
            instructions: renderedPrompt,
            tools: audioEnabled
              ? [
                {
                  type: 'web_search',
                  filters: {
                    allowed_domains: [
                      'youtube.com',
                      'www.youtube.com',
                      'm.youtube.com',
                    ],
                  },
                },
              ]
              : [],
            tool_choice: audioEnabled ? 'auto' : 'none',
            input: `Generate new 5-hint game entry ${index + 1} of ${notes.noOfWords} for the category "${resolvedGameName}". Attempt ${attempt + 1} of 4. Choose an answer that is unique after trim-and-lowercase normalization and is not already present in the avoid list or already generated in this batch.`,
            text: {
              format: {
                type: 'json_schema',
                name: 'five_hint_game_entry',
                strict: true,
                schema,
              },
            },
          })
        } catch (error) {
          const status = Number(error && error.status)

          if (status === 401 || status === 403) {
            throw new HttpError(502, 'OpenAI rejected the request. Check OPENAI_API_KEY and project permissions.', {
              status,
              code: error && error.code ? error.code : undefined,
              type: error && error.type ? error.type : undefined,
              reason: error && error.message ? error.message : 'Authorization failed.',
            })
          }

          if (status === 429) {
            throw new HttpError(502, 'OpenAI rate limit or quota error.', {
              status,
              code: error && error.code ? error.code : undefined,
              type: error && error.type ? error.type : undefined,
              reason: error && error.message ? error.message : 'Rate limited.',
            })
          }

          throw new HttpError(502, 'OpenAI request failed.', {
            status: Number.isInteger(status) ? status : undefined,
            code: error && error.code ? error.code : undefined,
            type: error && error.type ? error.type : undefined,
            reason: error && error.message ? error.message : 'Unknown OpenAI error.',
          })
        }

        let generatedEntry

        try {
          generatedEntry = JSON.parse(response.output_text)
        } catch (error) {
          throw new Error(`OpenAI returned invalid JSON: ${error.message}`)
        }

        const sanitizedEntry = this.sanitizeGenerated5HintEntry(generatedEntry, resolvedCategory)
        const normalizedAnswer = normalizeWord(sanitizedEntry.answer)

        if (existingAnswers.has(normalizedAnswer)) {
          continue
        }

        finalEntry = {
          id: nextId,
          ...sanitizedEntry,
          created_by: nickName,
        }
        existingAnswers.add(normalizedAnswer)
        existingAnswerMap.set(normalizedAnswer, sanitizedEntry.answer)
        break
      }

      if (!finalEntry) {
        throw new HttpError(409, 'Unable to generate a unique entry after multiple attempts.', {
          game_name: resolvedGameName,
        })
      }

      created.push(finalEntry)
      stagingEntries.push(finalEntry)
      this.writeCategoryEntries(stagingFilePath, stagingEntries)
      nextId += 1
    }

    return {
      category: categoryType,
      game_name: resolvedGameName,
      fileName: path.basename(stagingFilePath),
      stagingFile: path.basename(stagingFilePath),
      promptFile: path.basename(promptFilePath),
      gamePromptFile,
      promptLogs,
      created,
      totalCreated: created.length,
      totalEntries: stagingEntries.length,
    }
  }

  get5HintWordCategories() {
    const fileMap = this.readCategoryFileMap()
    const categoryCounts = new Map()

    Object.values(fileMap)
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      .forEach((entry) => {
        const rawCategory = typeof entry.category === 'string' ? entry.category.trim() : ''
        if (!rawCategory) {
          return
        }

        const key = normalizeString(rawCategory)
        const createdBy = typeof entry.created_by === 'string' ? entry.created_by.trim() : ''
        const createdByKey = normalizeString(createdBy) || 'unknown'

        const existing = categoryCounts.get(key)
        if (existing) {
          existing.games += 1
          existing.created_by[createdByKey] = (existing.created_by[createdByKey] || 0) + 1
        } else {
          categoryCounts.set(key, {
            category: rawCategory,
            games: 1,
            created_by: {
              [createdByKey]: 1,
            },
          })
        }
      })

    return {
      categories: Array.from(categoryCounts.values())
        .sort((left, right) => left.category.localeCompare(right.category)),
    }
  }

  getAll5HintGames(options = {}) {
    const fileMap = this.readCategoryFileMap()
    const normalizedCategory = typeof options.category === 'string'
      ? normalizeString(options.category)
      : ''
    if (!normalizedCategory) {
      throw new HttpError(400, 'Query parameter "category" is required.')
    }
    const normalizedState = typeof options.state === 'string' && options.state.trim()
      ? normalizeString(options.state)
      : normalizeString('published')

    const games = Object.values(fileMap)
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      .map((entry) => ({
        category: typeof entry.category === 'string' ? entry.category.trim() : '',
        game_name: typeof entry.game_name === 'string' ? entry.game_name.trim() : '',
        file_name: typeof entry.file_name === 'string' ? entry.file_name.trim() : '',
        created_by: typeof entry.created_by === 'string' ? entry.created_by.trim() : '',
        state: typeof entry.state === 'string' && entry.state.trim() ? entry.state.trim() : 'published',
      }))
      .filter((entry) => entry.game_name && entry.file_name)
      .filter((entry) => normalizeString(entry.category) === normalizedCategory)
      .filter((entry) => normalizeString(entry.state) === normalizedState)
      .sort((left, right) => left.game_name.localeCompare(right.game_name))

    return {
      count: games.length,
      state: normalizedState,
      games,
    }
  }

  getStaging5HintGame(category, game, createdBy) {
    const safeCategory = String(category || '').trim()
    const safeGame = String(game || '').trim()
    const safeCreatedBy = String(createdBy || '').trim()

    if (!safeCategory) {
      throw new HttpError(400, 'category is required.')
    }
    if (!safeGame) {
      throw new HttpError(400, 'game is required.')
    }
    if (!safeCreatedBy) {
      throw new HttpError(400, 'createdBy is required.')
    }

    const normalizedCategory = normalizeString(safeCategory)
    const normalizedGame = normalizeString(safeGame)
    const normalizedCreatedBy = normalizeString(safeCreatedBy)

    const fileMap = this.readCategoryFileMap()
    const matchedEntry = Object.entries(fileMap).find(([key, value]) => {
      const entryCategory = typeof value?.category === 'string' ? value.category.trim() : ''
      const entryGameName = typeof value?.game_name === 'string' ? value.game_name.trim() : ''
      const entryCreatedBy = typeof value?.created_by === 'string' ? value.created_by.trim() : ''

      return normalizeString(entryCategory) === normalizedCategory
        && (normalizeString(entryGameName) === normalizedGame || normalizeString(key) === normalizedGame)
        && normalizeString(entryCreatedBy) === normalizedCreatedBy
    })

    if (!matchedEntry) {
      throw new HttpError(
        404,
        `Game "${safeGame}" was not found for category "${safeCategory}" created by "${safeCreatedBy}".`
      )
    }

    const mapEntry = matchedEntry[1]
    const sourceFileName = mapEntry.file_name
    const stagingFilePath = this.getStagingFilePath(sourceFileName)
    const stagingFileName = path.basename(stagingFilePath)

    if (!fs.existsSync(stagingFilePath)) {
      throw new HttpError(404, `Staging file "${stagingFileName}" was not found.`)
    }

    let parsed

    try {
      parsed = JSON.parse(fs.readFileSync(stagingFilePath, 'utf8'))
    } catch (error) {
      throw new Error(`Malformed JSON in staging data file "${stagingFileName}": ${error.message}`)
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Staging data file "${stagingFileName}" must contain a top-level array.`)
    }

    return {
      category: mapEntry.category,
      game_name: mapEntry.game_name,
      created_by: mapEntry.created_by,
      fileName: stagingFileName,
      sourceFileName,
      count: parsed.length,
      data: parsed,
    }
  }

  approve5HintGameEntry(options = {}) {
    const safeCategory = String(options.category || '').trim()
    const safeGame = String(options.game_name || options.gameName || '').trim()
    const safeUserName = String(options.user_name || options.userName || '').trim()
    const entryJson = options.entry_json || options.entryJson

    if (!safeCategory) {
      throw new HttpError(400, 'category is required.')
    }
    if (!safeGame) {
      throw new HttpError(400, 'game_name is required.')
    }
    if (!safeUserName) {
      throw new HttpError(400, 'user_name is required.')
    }

    const normalizedCategory = normalizeString(safeCategory)
    const normalizedGame = normalizeString(safeGame)
    const normalizedUserName = normalizeString(safeUserName)

    const fileMap = this.readCategoryFileMap()
    const matchedEntry = Object.entries(fileMap).find(([key, value]) => {
      const entryCategory = typeof value?.category === 'string' ? value.category.trim() : ''
      const entryGameName = typeof value?.game_name === 'string' ? value.game_name.trim() : ''
      const entryCreatedBy = typeof value?.created_by === 'string' ? value.created_by.trim() : ''

      return normalizeString(entryCategory) === normalizedCategory
        && (normalizeString(entryGameName) === normalizedGame || normalizeString(key) === normalizedGame)
        && normalizeString(entryCreatedBy) === normalizedUserName
    })

    if (!matchedEntry) {
      throw new HttpError(
        404,
        `Game "${safeGame}" was not found for category "${safeCategory}" created by "${safeUserName}".`
      )
    }

    const [mapKey, mapEntry] = matchedEntry
    const fileName = mapEntry.file_name
    const filePath = path.join(path.dirname(this.categoryFileMapPath), fileName)

    let entries = []
    if (fs.existsSync(filePath)) {
      try {
        entries = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      } catch (error) {
        throw new Error(`Malformed JSON in category data file "${fileName}": ${error.message}`)
      }

      if (!Array.isArray(entries)) {
        throw new Error(`Category data file "${fileName}" must contain a top-level array.`)
      }
    }

    const approvedEntry = this.sanitizeApproved5HintEntry(entryJson, mapEntry.category)
    entries.push(approvedEntry)
    this.writeCategoryEntries(filePath, entries)

    fileMap[mapKey] = {
      ...mapEntry,
      state: 'published',
    }
    this.writeCategoryFileMap(fileMap)

    return {
      category: mapEntry.category,
      game_name: mapEntry.game_name,
      created_by: mapEntry.created_by,
      fileName,
      state: 'published',
      approved: approvedEntry,
      totalEntries: entries.length,
    }
  }

  get5HintWordBeginningWith(category, game, createdBy, startsWith) {
    const safeCategory = String(category || '').trim()
    const safeGame = String(game || '').trim()
    const safeCreatedBy = String(createdBy || '').trim()
    const safePrefix = String(startsWith || '').trim()

    if (!safeCategory) {
      throw new HttpError(400, 'category is required.')
    }
    if (!safeGame) {
      throw new HttpError(400, 'game is required.')
    }
    if (!safeCreatedBy) {
      throw new HttpError(400, 'createdBy is required.')
    }
    if (!safePrefix) {
      throw new HttpError(400, 'startsWith is required.')
    }

    const normalizedCategory = normalizeString(safeCategory)
    const normalizedGame = normalizeString(safeGame)
    const normalizedCreatedBy = normalizeString(safeCreatedBy)

    const fileMap = this.readCategoryFileMap()
    const matchedEntry = Object.entries(fileMap).find(([key, value]) => {
      const entryCategory = typeof value?.category === 'string' ? value.category.trim() : ''
      const entryGameName = typeof value?.game_name === 'string' ? value.game_name.trim() : ''
      const entryCreatedBy = typeof value?.created_by === 'string' ? value.created_by.trim() : ''

      return normalizeString(entryCategory) === normalizedCategory
        && (normalizeString(entryGameName) === normalizedGame || normalizeString(key) === normalizedGame)
        && normalizeString(entryCreatedBy) === normalizedCreatedBy
    })

    if (!matchedEntry) {
      throw new HttpError(
        404,
        `Game "${safeGame}" was not found for category "${safeCategory}" created by "${safeCreatedBy}".`
      )
    }

    const fileName = matchedEntry[1].file_name
    const filePath = path.join(path.dirname(this.categoryFileMapPath), fileName)

    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
      throw new Error(`Malformed JSON in category data file "${fileName}": ${error.message}`)
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Category data file "${fileName}" must contain a top-level array.`)
    }

    const normalizedPrefix = normalizeWord(safePrefix)
    const words = parsed
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      .map((entry) => this.sanitizeCategoryWordEntry(entry, safeCategory))
      .map((entry) => entry.answer)
      .filter((answer) => normalizeWord(answer).includes(normalizedPrefix))
      .sort((left, right) => left.localeCompare(right))

    return {
      category: safeCategory,
      game: safeGame,
      createdBy: safeCreatedBy,
      fileName,
      startsWith: safePrefix,
      count: words.length,
      words,
    }
  }

  get20RandomWordsWith5Clues(category) {
    const { category: resolvedCategory, fileName, entries } = this.readCategoryEntries(category)

    const eligibleEntries = entries
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      .filter((entry) => typeof entry.answer === 'string' && entry.answer.trim())
      .filter((entry) => (
        Array.isArray(entry.clues)
        && entry.clues.length === 5
        && entry.clues.every((clue) => typeof clue === 'string' && clue.trim())
      ))
      .map((entry) => this.sanitizeCategoryWordEntry(entry, resolvedCategory))

    if (eligibleEntries.length === 0) {
      throw new HttpError(404, `No 5-clue entries found for category "${String(category || '').trim()}".`)
    }

    const count = Math.min(20, eligibleEntries.length)

    return {
      category: resolvedCategory,
      fileName,
      count,
      data: this.sampleWithoutReplacement(eligibleEntries, count),
    }
  }
}

module.exports = {
  DEFAULT_DATA_FILE,
  DEFAULT_CATEGORY_FILE_MAP,
  HttpError,
  WordsService,
}
