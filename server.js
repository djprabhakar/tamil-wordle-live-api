const { createApp } = require('./app')

const port = Number(process.env.PORT || 4000)
const host = process.env.HOST || '0.0.0.0'

async function startServer() {
  const { app, liveGamesStore } = createApp()

  await liveGamesStore.loadStore()

  app.listen(port, host, () => {
    console.log(`API running on http://${host}:${port}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start server:', error.message)
  process.exit(1)
})
