const express = require('express')

const { createShareController } = require('../controllers/share.controller')

function createShareRouter() {
  const router = express.Router()
  const controller = createShareController()

  router.get('/share', controller.getSharePage)
  router.get('/og-image', controller.getOgImage)

  return router
}

module.exports = {
  createShareRouter,
}
