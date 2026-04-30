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
  router.get('/GetAll5HintGames', controller.getAll5HintGames)
  router.get('/GetAll5HintGamesByUser', controller.getAll5HintGamesByUser)
  router.get('/GetStaging5HintGame', controller.getStaging5HintGame)
  router.get('/Get5HintWordBeginningWith', controller.get5HintWordBeginningWith)
  router.get('/Get20RandomWordsWith5Clues', controller.get20RandomWordsWith5Clues)
  router.get('/GetDailyPuzzles', controller.getDailyPuzzles)
  router.get('/Create5HintGameEnvironment', controller.getCreate5HintGameEnvironment)
  router.get('/Create5HintGameJobs/:jobId', controller.getCreate5HintGameJob)
  router.get('/:word', controller.getByWord)
  router.post('/check', controller.checkWord)
  router.post('/Create5HintGame', controller.create5HintGame)
  router.post('/Approve5HintGameEntry', controller.approve5HintGameEntry)
  router.post('/SaveA5HintWord', controller.saveA5HintWord)

  return router
}

module.exports = {
  createWordsRouter,
}
