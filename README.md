# Tamil Wordle Live API

Express API for multiplayer live games.

## Run

1. Install dependencies:
   npm install
2. Start server:
   npm run dev

Default URL: http://localhost:4000

## Endpoints

- GET /health
- GET /live-games
- POST /live-games

POST body example:

{
  "id": "GABC1234",
  "word": "?????",
  "wordLength": 5,
  "hostPlayerId": "player-id",
  "hostNickname": "Player",
  "createdAt": 1741390000000
}

## Environment Variables

- PORT (default: 4000)
- HOST (default: 0.0.0.0)
- MAX_LIVE_GAMES (default: 200)
- ALLOWED_ORIGINS (comma-separated)
