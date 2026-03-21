const { HttpError } = require('../services/words.service')
const { getSafeBody } = require('../utils/normalize')

function parseOptionalPositiveInt(value, fieldName) {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(400, `Query parameter "${fieldName}" must be a positive integer.`)
  }

  return parsed
}

function parseOptionalBoolean(value, fieldName) {
  if (value === undefined) {
    return undefined
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  throw new HttpError(400, `Query parameter "${fieldName}" must be "true" or "false".`)
}

function createWordsController(wordsService) {
  return {
    getCategories(req, res, next) {
      try {
        res.json({ categories: wordsService.getCategories() })
      } catch (error) {
        next(error)
      }
    },

    getRandom(req, res, next) {
      try {
        const record = wordsService.getRandomWord(req.query.category)
        res.json(record)
      } catch (error) {
        next(error)
      }
    },

    getRandomSet(req, res, next) {
      try {
        const count = parseOptionalPositiveInt(req.query.count, 'count')
        if (count === undefined) {
          throw new HttpError(400, 'Query parameter "count" is required.')
        }

        const data = wordsService.getRandomSet({
          count,
          category: req.query.category,
        })

        res.json({
          count: data.length,
          data,
        })
      } catch (error) {
        next(error)
      }
    },

    getAll(req, res, next) {
      try {
        const limit = parseOptionalPositiveInt(req.query.limit, 'limit')
        const page = parseOptionalPositiveInt(req.query.page, 'page')
        const shuffle = parseOptionalBoolean(req.query.shuffle, 'shuffle')

        if (page !== undefined && limit === undefined) {
          throw new HttpError(400, 'Query parameter "page" requires "limit".')
        }

        const result = wordsService.getAll({
          category: req.query.category,
          limit,
          page,
          shuffle,
        })

        if (result.pagination) {
          res.json(result)
          return
        }

        res.json(result.data)
      } catch (error) {
        next(error)
      }
    },

    getByWord(req, res, next) {
      try {
        res.json(wordsService.getByWord(req.params.word))
      } catch (error) {
        next(error)
      }
    },

    checkWord(req, res, next) {
      try {
        const body = getSafeBody(req.body)
        const result = wordsService.checkWord(body.guess)
        res.json(result)
      } catch (error) {
        next(error)
      }
    },

    saveA5HintWord(req, res, next) {
      try {
        const body = getSafeBody(req.body)
        const result = wordsService.saveA5HintWord(body.category, body.wordEntry)
        res.status(201).json(result)
      } catch (error) {
        next(error)
      }
    },

    get5HintWordCategories(_req, res, next) {
      try {
        res.json(wordsService.get5HintWordCategories())
      } catch (error) {
        next(error)
      }
    },

    get20RandomWordsWith5Clues(req, res, next) {
      try {
        const result = wordsService.get20RandomWordsWith5Clues(req.query.category)
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  }
}

module.exports = {
  createWordsController,
}
