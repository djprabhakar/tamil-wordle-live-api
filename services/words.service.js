const fs = require('fs')
const path = require('path')

const { normalizeString, normalizeWord } = require('../utils/normalize')

const DEFAULT_DATA_FILE = path.join(__dirname, '..', 'data', 'common_500_words_with_5_clues.json')
const DEFAULT_CATEGORY_FILE_MAP = path.join(__dirname, '..', 'data', 'category-file-map.json')
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
      const normalizedWord = normalizeWord(validated.word)

      if (nextWordMap.has(normalizedWord)) {
        throw new Error(
          `Duplicate normalized word "${normalizedWord}" found in words data file at index ${index}.`
        )
      }

      const normalizedCategory = normalizeString(validated.category)
      const record = {
        word: validated.word.trim(),
        category: validated.category.trim(),
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
      .map((records) => records[0].category)
      .sort((left, right) => left.localeCompare(right))
    this.isLoaded = true
  }

  validateWordEntry(item, index) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid entry at index ${index}: expected an object.`)
    }

    const word = typeof item.word === 'string' ? item.word : ''
    const category = typeof item.category === 'string' ? item.category : ''
    const clues = item.clues

    if (!word.trim()) {
      throw new Error(`Invalid entry at index ${index}: "word" must be a non-empty string.`)
    }

    if (!category.trim()) {
      throw new Error(`Invalid entry at index ${index}: "category" must be a non-empty string.`)
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

    return { word, category, clues }
  }

  ensureLoaded() {
    if (!this.isLoaded) {
      throw new Error('Words service was used before data finished loading.')
    }
  }

  sanitizeWord(record) {
    return {
      word: record.word,
      category: record.category,
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
      word: record.word,
      category: record.category,
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

  sanitizeCategoryWordEntry(entry, fallbackCategory) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new HttpError(400, 'WordEntry must be a JSON object.')
    }

    const word = typeof entry.word === 'string' ? entry.word.trim() : ''
    if (!word) {
      throw new HttpError(400, 'WordEntry must contain a non-empty "word" string.')
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

    const normalizedEntry = {
      ...entry,
      word,
      clues,
    }

    if (typeof normalizedEntry.category === 'string' && normalizedEntry.category.trim()) {
      normalizedEntry.category = normalizedEntry.category.trim()
      return normalizedEntry
    }

    return {
      ...normalizedEntry,
      category: String(fallbackCategory || '').trim(),
    }
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
      .map((entry) => entry.word)
      .filter((word) => normalizeWord(word).startsWith(normalizedPrefix))
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
      .filter((entry) => typeof entry.word === 'string' && entry.word.trim())
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
