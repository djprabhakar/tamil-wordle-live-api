const express = require('express')

const { createWordsController } = require('../controllers/words.controller')

function createWordsRouter(wordsService) {
  const router = express.Router()
  const controller = createWordsController(wordsService)

  router.get('/categories', controller.getCategories)
  router.get('/random-set', controller.getRandomSet)
  router.get('/random', controller.getRandom)
  router.get('/all', controller.getAll)
  router.get('/Get5HintWordCategories', controller.get5HintWordCategories)
  router.get('/Get5HintWordBeginningWith', controller.get5HintWordBeginningWith)
  router.get('/Get20RandomWordsWith5Clues', controller.get20RandomWordsWith5Clues)
  router.get('/:word', controller.getByWord)
  router.post('/check', controller.checkWord)
  router.post('/SaveA5HintWord', controller.saveA5HintWord)

  return router
}

module.exports = {
  createWordsRouter,
}
