# Tamil Wordle Live API

Express API for multiplayer live games.

## Run

1. Install dependencies:
   npm install
2. Start server:
   npm run dev

Default URL: http://localhost:4000

## Data Persistence

Games are persisted to JSON file storage.

- Default store file: `data/live-games-store.json`
- Override path with env var: `STORE_FILE=/absolute/path/store.json`

## Endpoints

- GET /health
- GET /live-games
- GET /live-games/:id
- POST /live-games
- POST /live-games/:id/participation

### Create Live Game

POST `/live-games` body example:

```json
{
  "id": "GABC1234",
  "word": "?????",
  "wordLength": 5,
  "hostPlayerId": "player-id",
  "hostNickname": "Player",
  "createdAt": 1741390000000
}
```

Response includes participation stats:

- `totalParticipants`
- `successfulParticipants`
- `unsuccessfulParticipants`

### Record Participation Result

POST `/live-games/:id/participation` body example:

```json
{
  "playerId": "player-123",
  "outcome": "success"
}
```

`outcome` can be `success` or `failure`.
Each player is counted once in total participants. If a player's outcome changes, counts are updated accordingly.

## Environment Variables

- PORT (default: 4000)
- HOST (default: 0.0.0.0)
- MAX_LIVE_GAMES (default: 200)
- ALLOWED_ORIGINS (comma-separated)
- STORE_FILE (optional absolute path to JSON store)
