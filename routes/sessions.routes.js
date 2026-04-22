const express = require('express')

const { createSessionsController } = require('../controllers/sessions.controller')

function createSessionsRouter(sessionsService) {
  const router = express.Router()
  const controller = createSessionsController(sessionsService)

  router.get('/', controller.list)
  router.post('/create', controller.create)
  router.post('/join', controller.join)
  router.get('/:id', controller.get)
  router.post('/:id/start', controller.start)
  router.post('/:id/submit', controller.submit)
  router.post('/:id/next', controller.next)
  router.delete('/:id/leave', controller.leave)

  return router
}

module.exports = {
  createSessionsRouter,
}
