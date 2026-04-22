function createSessionsController(sessionsService) {
  return {
    list(_req, res, next) {
      try {
        res.json(sessionsService.list(_req.query || {}))
      } catch (error) {
        next(error)
      }
    },

    create(req, res, next) {
      try {
        res.json(sessionsService.create(req.body || {}))
      } catch (error) {
        next(error)
      }
    },

    join(req, res, next) {
      try {
        res.json(sessionsService.join(req.body || {}))
      } catch (error) {
        next(error)
      }
    },

    get(req, res, next) {
      try {
        res.json(sessionsService.get(req.params.id))
      } catch (error) {
        next(error)
      }
    },

    submit(req, res, next) {
      try {
        res.json(sessionsService.submit(req.params.id, req.body || {}))
      } catch (error) {
        next(error)
      }
    },

    next(req, res, next) {
      try {
        res.json(sessionsService.next(req.params.id, req.body || {}))
      } catch (error) {
        next(error)
      }
    },

    leave(req, res, next) {
      try {
        res.json(sessionsService.leave(req.params.id, req.body || {}))
      } catch (error) {
        next(error)
      }
    },
  }
}

module.exports = {
  createSessionsController,
}
