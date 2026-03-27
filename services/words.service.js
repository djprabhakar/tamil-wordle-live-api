const fs = require('fs')
const path = require('path')

const { normalizeString, normalizeWord } = require('../utils/normalize')

const DEFAULT_DATA_FILE = path.join(__dirname, '..', 'data', 'common_500_words_with_5_clues.json')
const DEFAULT_CATEGORY_FILE_MAP = path.join(__dirname, '..', 'data', 'category-file-map.json')
const DEFAULT_CATEGORY_PROMPTS_DIR = path.join(__dirname, '..', 'data', 'category-prompts')
const DEFAULT_CATEGORY_FILE_SEED = {
  Common: 'common_500_words_with_5_clues.json',
  "80's Rock Hits": '80s_Rock_Hits.json',
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
    this.words = []
    this.wordMap = new Map()
    this.categoryMap = new Map()
    this.categories = []
    this.isLoaded = false
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

    return parsed
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
    const existingCategory = Object.keys(fileMap).find((key) => normalizeString(key) === normalizedCategory)

    if (existingCategory) {
      return {
        category: existingCategory,
        fileName: fileMap[existingCategory],
        isNew: false,
        fileMap,
      }
    }

    if (!options.createIfMissing) {
      throw new HttpError(404, `Category "${String(category).trim()}" was not found.`)
    }

    const derivedFileName = this.deriveFileNameFromCategory(category)
    fileMap[String(category).trim()] = derivedFileName
    this.writeCategoryFileMap(fileMap)

    const filePath = path.join(path.dirname(this.categoryFileMapPath), derivedFileName)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]\n', 'utf8')
    }

    return {
      category: String(category).trim(),
      fileName: derivedFileName,
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

  writeCategoryEntries(filePath, entries) {
    fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
  }

  ensureCategoryPromptsDir() {
    fs.mkdirSync(this.categoryPromptsDir, { recursive: true })
  }

  getPromptFilePath(fileName) {
    return path.join(this.categoryPromptsDir, fileName.replace(/\.json$/i, '.prompt.json'))
  }

  createDefaultPromptConfig(category) {
    return {
      category,
      version: 1,
      promptTemplate: 'Generate {{NoOfWords}} distinct entries for the category "{{CategoryName}}". The server will request them one at a time until {{NoOfWords}} entries are created. Return a single JSON object only for each request. Always include answer, category, title, and clues. The generated entry category value must be "{{EntryCategory}}". {{MetaInstruction}} Use this overall game guidance when shaping the entry: {{GamePrompt}} Use this as a direct instruction for generating the title: {{TitlePrompt}} Use this as rules and guidelines for generating the 5 clues: {{CluesPrompt}} The title must not reveal the answer directly. The clues array must contain exactly 5 non-empty strings. {{CategorySpecificRules}} {{AudioInstruction}} Generated entry id must be omitted. The server will assign ids. Set created_by to "{{NickName}}" will be handled by the server. Do not include explanation text outside the JSON object.',
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

  getNextEntryId(entries) {
    return entries.reduce((maxId, entry) => {
      const id = Number(entry && entry.id)
      if (!Number.isInteger(id) || id < 1) {
        return maxId
      }

      return Math.max(maxId, id)
    }, 0) + 1
  }

  parseCreate5HintNotes(notes) {
    if (notes === undefined) {
      return {
        noOfWords: 1,
        gamePrompt: '',
        titlePrompt: '',
        cluesPrompt: '',
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

    return {
      noOfWords,
      gamePrompt,
      titlePrompt,
      cluesPrompt,
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
    const category = typeof entry.category === 'string' && entry.category.trim()
      ? entry.category.trim()
      : String(fallbackCategory || '').trim()

    const orderedEntry = {
      ...('id' in normalizedEntry ? { id: normalizedEntry.id } : {}),
      category,
      answer,
      ...(meta ? { meta } : {}),
      ...(title ? { title } : {}),
      clues,
      ...(media ? { media } : {}),
    }

    for (const [key, value] of Object.entries(normalizedEntry)) {
      if (['id', 'category', 'answer', 'meta', 'title', 'clues', 'media'].includes(key)) {
        continue
      }
      orderedEntry[key] = value
    }

    return orderedEntry
  }

  saveA5HintWord(category, wordEntry) {
    const safeCategory = String(category || '').trim()
    if (!safeCategory) {
      throw new HttpError(400, 'Category is required.')
    }

    const sanitizedEntry = this.sanitizeCategoryWordEntry(wordEntry, safeCategory)
    const { category: resolvedCategory, fileName, filePath, entries } = this.readCategoryEntries(safeCategory, {
      createIfMissing: true,
    })

    entries.push(sanitizedEntry)
    this.writeCategoryEntries(filePath, entries)

    return {
      category: resolvedCategory,
      fileName,
      saved: sanitizedEntry,
      totalEntries: entries.length,
    }
  }

  async create5HintGame(options = {}) {
    const safeCategory = String(options.category || '').trim()
    const nickName = String(options.nickName || options.nick_name || '').trim()
    const notes = this.parseCreate5HintNotes(options.notes)
    const audioEnabled = options.audioEnabled === true || options.audio_enabled === true
    const audioClue = options.audioClue || options.audio_clue

    if (!safeCategory) {
      throw new HttpError(400, 'category is required.')
    }

    if (!nickName) {
      throw new HttpError(400, 'nick_name is required.')
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new HttpError(500, 'OPENAI_API_KEY is not configured.')
    }

    const OpenAI = require('openai')
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const { category: resolvedCategory, fileName, filePath, entries } = this.readCategoryEntries(safeCategory, {
      createIfMissing: true,
    })
    const { promptFilePath, promptConfig } = this.readCategoryPromptConfig(resolvedCategory, fileName)
    let nextId = this.getNextEntryId(entries)

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        answer: { type: 'string' },
        category: { type: 'string' },
        title: { type: 'string' },
        clues: {
          type: 'array',
          items: { type: 'string' },
          minItems: 5,
          maxItems: 5,
        },
        meta: {
          type: 'object',
          additionalProperties: true,
          properties: {
            artist: { type: 'string' },
            year: { type: 'integer' },
          },
          required: [],
        },
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
      required: audioEnabled
        ? ['answer', 'category', 'title', 'clues', 'media']
        : ['answer', 'category', 'title', 'clues'],
    }

    const defaultTemplate = this.createDefaultPromptConfig(resolvedCategory).promptTemplate
    const promptTemplate = typeof promptConfig.promptTemplate === 'string' && promptConfig.promptTemplate.trim()
      ? promptConfig.promptTemplate
      : defaultTemplate

    const templateVariables = {
      NoOfWords: notes.noOfWords,
      CategoryName: resolvedCategory,
      EntryCategory: resolvedCategory === "80's Rock Hits" || resolvedCategory === 'Contemporary  Hits' ? 'song' : 'thing',
      NickName: nickName,
      GamePrompt: notes.gamePrompt || 'Keep the overall game coherent, recognizable, and fun to solve without revealing the answer too directly.',
      TitlePrompt: notes.titlePrompt || 'Generate a concise teaser sentence for the title.',
      CluesPrompt: notes.cluesPrompt || 'Generate 5 clues from broad to specific.',
      MetaInstruction: resolvedCategory === "80's Rock Hits" || resolvedCategory === 'Contemporary  Hits'
        ? 'Include a meta object with artist and year whenever possible.'
        : 'Include a meta object only if it adds meaningful value.',
      CategorySpecificRules: resolvedCategory === "80's Rock Hits"
        ? 'The answer should be the song title only, not the artist name. Mention the artist or era in the title without revealing the answer directly. Write clues that move from broad cultural context to more identifying specifics.'
        : resolvedCategory === 'Contemporary  Hits'
          ? 'The answer should be the song title only, not the artist name. Prefer globally recognizable songs from the modern streaming era unless the request narrows the scope.'
          : 'Choose a familiar everyday word or phrase that is broadly recognizable. Order the clues from broader and easier to more specific.',
      AudioInstruction: audioEnabled
        ? `After the clues section, include a media object with type, videoId, start, and duration. Search YouTube for karaoke videos of the answer and retrieve the YouTube videoId from the best fitting karaoke result. ${audioClue ? `Audio clue context: ${JSON.stringify(audioClue)}` : ''}`
        : 'Do not include a media object.',
    }

    const renderedPrompt = this.renderPromptTemplate(promptTemplate, templateVariables)

    const created = []

    for (let index = 0; index < notes.noOfWords; index += 1) {
      const response = await client.responses.create({
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
        input: `Generate new 5-hint game entry ${index + 1} of ${notes.noOfWords} for the category "${resolvedCategory}".`,
        text: {
          format: {
            type: 'json_schema',
            name: 'five_hint_game_entry',
            strict: true,
            schema,
          },
        },
      })

      let generatedEntry

      try {
        generatedEntry = JSON.parse(response.output_text)
      } catch (error) {
        throw new Error(`OpenAI returned invalid JSON: ${error.message}`)
      }

      const sanitizedEntry = this.sanitizeCategoryWordEntry(generatedEntry, resolvedCategory)
      const finalEntry = {
        id: nextId,
        ...sanitizedEntry,
        created_by: nickName,
      }

      entries.push(finalEntry)
      created.push(finalEntry)
      nextId += 1
    }

    this.writeCategoryEntries(filePath, entries)

    return {
      category: resolvedCategory,
      fileName,
      promptFile: path.basename(promptFilePath),
      created,
      totalCreated: created.length,
      totalEntries: entries.length,
    }
  }

  get5HintWordCategories() {
    const fileMap = this.readCategoryFileMap()

    return {
      categories: Object.keys(fileMap).sort((left, right) => left.localeCompare(right)),
    }
  }

  get5HintWordBeginningWith(category, startsWith) {
    const safePrefix = String(startsWith || '').trim()
    if (!safePrefix) {
      throw new HttpError(400, 'startsWith is required.')
    }

    const normalizedPrefix = normalizeWord(safePrefix)
    const { category: resolvedCategory, fileName, entries } = this.readCategoryEntries(category)

    const words = entries
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      .map((entry) => this.sanitizeCategoryWordEntry(entry, resolvedCategory))
      .map((entry) => entry.answer)
      .filter((answer) => normalizeWord(answer).startsWith(normalizedPrefix))
      .sort((left, right) => left.localeCompare(right))

    return {
      category: resolvedCategory,
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
      .filter((entry) => (
        (typeof entry.answer === 'string' && entry.answer.trim())
        || (typeof entry.word === 'string' && entry.word.trim())
      ))
      .filter((entry) => Array.isArray(entry.clues) && entry.clues.length === 5)
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
