# Tamil Wordle Live API

Express API with two parts:

- existing live-games endpoints
- a reusable `/api/words` module backed by a local JSON file

## Install and Run

```bash
npm install
npm start
```

Default URL: `http://localhost:4000`

Swagger UI: `http://localhost:4000/docs`
OpenAPI JSON: `http://localhost:4000/openapi.json`

## Words Data File

Place your production word list here:

`data/common_500_words_with_5_clues.json`

Expected structure:

```json
[
  {
    "answer": "car",
    "title": "thing",
    "clues": ["vehicle", "engine", "road", "electric", "autonomous"]
  }
]
```

Startup validation will fail fast if:

- the file is missing
- the JSON is malformed
- an entry has missing fields
- `clues` does not contain exactly 5 non-empty strings
- duplicate normalized words exist

## Words Endpoints

- `GET /health`
- `GET /api/words/categories`
- `GET /api/words/random`
- `GET /api/words/random?category=animal`
- `GET /api/words/random-set?count=10&category=thing`
- `GET /api/words/all`
- `GET /api/words/all?category=thing`
- `GET /api/words/all?limit=20&page=2`
- `GET /api/words/all?shuffle=true`
- `GET /api/words/car`
- `POST /api/words/check`
- `POST /api/words/Create5HintGame`
- `GET /api/words/Create5HintGameJobs/:jobId`
- `GET /api/words/Create5HintGameEnvironment`
- `POST /api/words/SaveA5HintWord`
- `GET /api/words/Get5HintWordCategories`
- `GET /api/words/GetAll5HintGames?category=audio-songs&createdby=system&state=published`
- `GET /api/words/GetStaging5HintGame?category=audio-songs&game=80's Rock Hits&createdby=system`
- `GET /api/words/Get5HintWordBeginningWith?category=audio-songs&game=80's Rock Hits&createdby=system&startsWith=Ba`
- `GET /api/words/Get20RandomWordsWith5Clues?game=Common`
- `POST /api/words/Approve5HintGameEntry`

### curl examples

```bash
curl http://localhost:4000/health
curl http://localhost:4000/openapi.json
curl http://localhost:4000/api/words/categories
curl http://localhost:4000/api/words/Create5HintGameEnvironment
curl -X POST http://localhost:4000/api/words/Create5HintGame ^
  -H "Content-Type: application/json" ^
  -d "{\"category\":\"audio-songs\",\"game_name\":\"80's Rock Hits\",\"nick_name\":\"prabhakar\",\"audio_enabled\":true,\"notes\":{\"NoOfWords\":2,\"GamePrompt\":\"Make the overall game feel like a stadium-rock challenge.\",\"AudioPrompt\":\"After the clues, add a karaoke-focused YouTube media object for the answer.\",\"TitlePrompt\":\"Make the title punchy.\",\"CluesPrompt\":\"Go from broad to iconic.\"}}"
curl http://localhost:4000/api/words/Create5HintGameJobs/JABC1234
curl http://localhost:4000/api/words/Get5HintWordCategories
curl "http://localhost:4000/api/words/GetAll5HintGames?category=audio-songs&createdby=system&state=published"
curl "http://localhost:4000/api/words/GetStaging5HintGame?category=audio-songs&game=80's Rock Hits&createdby=system"
curl "http://localhost:4000/api/words/Get5HintWordBeginningWith?category=audio-songs&game=80's Rock Hits&createdby=system&startsWith=Ba"
curl "http://localhost:4000/api/words/random?category=thing"
curl "http://localhost:4000/api/words/random-set?count=10&category=thing"
curl "http://localhost:4000/api/words/all?limit=10&page=1"
curl http://localhost:4000/api/words/car
curl -X POST http://localhost:4000/api/words/check ^
  -H "Content-Type: application/json" ^
  -d "{\"guess\":\"car\"}"
curl -X POST http://localhost:4000/api/words/SaveA5HintWord ^
  -H "Content-Type: application/json" ^
  -d "{\"category\":\"Common\",\"wordEntry\":{\"answer\":\"plane\",\"category\":\"thing\",\"title\":\"thing\",\"clues\":[\"wings\",\"travel\",\"airport\",\"pilot\",\"sky\"]}}"
curl "http://localhost:4000/api/words/Get20RandomWordsWith5Clues?game=Common"
```

Response from `POST /api/words/check`:

```json
{
  "exists": true,
  "answer": "car",
  "title": "thing"
}
```

If not found:

```json
{
  "exists": false
}
```

Response from `POST /api/words/SaveA5HintWord`:

```json
{
  "category": "Common",
  "fileName": "common_500_words_with_5_clues.json",
  "saved": {
    "answer": "plane",
    "category": "thing",
    "title": "thing",
    "clues": ["wings", "travel", "airport", "pilot", "sky"]
  },
  "totalEntries": 501
}
```

Behavior:

- category-to-file mapping is stored in `data/category-file-map.json`
- each category-file-map entry stores `category`, `game_name`, `file_name`, `created_by`, and `state`
- if a category does not exist, the API creates a new mapping entry
- the new filename is derived from the category name, for example `Movie Titles` -> `Movie_Titles.json`
- `WordEntry` must be a JSON object with a non-empty `answer` and exactly 5 non-empty `clues`
- `POST /api/words/Create5HintGame` creates prompt files in `data/category-prompts/` when they do not already exist
- `POST /api/words/Create5HintGame` accepts `auto-approve`, which defaults to `true`
- when `auto-approve` is `true`, `POST /api/words/Create5HintGame` writes generated entries directly to the mapped `data/<file_name>` file with `clues` as an array of strings and marks the game as `published`
- when `auto-approve` is `false`, `POST /api/words/Create5HintGame` follows the staging flow and writes generated entries to `data/staging/<file>_staging.json` with review clue objects
- staged `Create5HintGame` clues are objects with `text` and `is_confirmed: "No"`
- rendered `Create5HintGame` prompts are stored as JSON nodes in `data/game-prompts/<file>_prompts.json` with separate `game_prompt`, `title_prompt`, `clues_prompt`, and `audio_prompt` fields
- `POST /api/words/Create5HintGame` requires `OPENAI_API_KEY`; `OPENAI_MODEL` is optional and defaults to `gpt-5`
- `POST /api/words/Create5HintGame` requires a non-empty `category`
- `POST /api/words/Create5HintGame` expects `game_name` to be the human-readable game label used for `data/category-file-map.json`
- `GET /api/words/Get5HintWordCategories` returns only categories with at least one `state: "published"` game; missing state is treated as `published`
- `GET /api/words/GetAll5HintGames` accepts optional `state`; when omitted, it returns only `state: "published"` games
- `GET /api/words/GetStaging5HintGame` looks up the mapped game and reads `data/staging/<file>_staging.json`
- `POST /api/words/Approve5HintGameEntry` appends an approved staged entry to the mapped live game file and updates the mapped game `state` to `published`
- `category` is the type label stored in generated entries, for example `audio-songs`
- `POST /api/words/Create5HintGame` expects `notes` as a JSON object with `NoOfWords`, `GamePrompt`, `AudioPrompt`, `TitlePrompt`, and `CluesPrompt`
- `POST /api/words/Create5HintGame` returns `202 Accepted` with a `jobId` and `statusUrl`
- poll `GET /api/words/Create5HintGameJobs/:jobId` until `status` becomes `completed` or `failed`
- `notes.NoOfWords` controls how many entries are generated in one request, from 1 to 20
- `notes.GamePrompt` gives higher-level direction for the overall game entry beyond the title and clue-specific instructions
- `notes.AudioPrompt` overrides the default audio-generation instruction when `audio_enabled` is `true`
- when `audio_enabled` is `true`, each generated entry must include a `media` object with `type`, `videoId`, `start`, and `duration`
- generated audio-game entries use `category: "audio-songs"` and store the human-readable category label in `game_name`
- `GET /api/words/Create5HintGameEnvironment` reports whether `OPENAI_API_KEY`, the OpenAI SDK, and the required writable directories are available

Response from `POST /api/words/Create5HintGame`:

```json
{
  "jobId": "JABC1234",
  "status": "queued",
  "category": "audio-songs",
  "game_name": "80's Rock Hits",
  "nick_name": "prabhakar",
  "queuedAt": 1743200000000,
  "statusUrl": "/api/words/Create5HintGameJobs/JABC1234"
}
```

Response from `GET /api/words/Get20RandomWordsWith5Clues?game=Common`:

```json
{
  "category": "Common",
  "fileName": "common_500_words_with_5_clues.json",
  "count": 20,
  "data": [
    {
      "answer": "car",
      "title": "thing",
      "clues": ["vehicle", "engine", "road", "electric", "autonomous"]
    }
  ]
}
```

Response from `GET /api/words/GetAll5HintGames?category=audio-songs&createdby=system`:

```json
{
  "count": 2,
  "games": [
    {
      "category": "audio-songs",
      "game_name": "80's Rock Hits",
      "file_name": "80s_Rock_Hits.json",
      "created_by": "system"
    },
    {
      "category": "audio-songs",
      "game_name": "Contemporary  Hits",
      "file_name": "contemporary_top_100.json",
      "created_by": "system"
    }
  ]
}
```

## Mount Into An Existing Express App

Use the full app:

```js
const { createApp } = require('./app')

const { app } = createApp()
app.listen(process.env.PORT || 4000)
```

Or mount only the words router:

```js
const express = require('express')
const { WordsService } = require('./services/words.service')
const { createWordsRouter } = require('./routes/words.routes')

const app = express()
const wordsService = new WordsService()

wordsService.loadFromDisk()

app.use(express.json())
app.use('/api/words', createWordsRouter(wordsService))
```

## Live Games Endpoints

- `GET /live-games`
- `GET /live-games/:id`
- `POST /live-games`
- `POST /live-games/:id/participation`

## Environment Variables

- `PORT` default `4000`
- `HOST` default `0.0.0.0`
- `MAX_LIVE_GAMES` default `200`
- `ALLOWED_ORIGINS` comma-separated allow list
- `STORE_FILE` optional path for the live-games JSON store
- `OPENAI_API_KEY` required for `Create5HintGame`
- `OPENAI_MODEL` optional model override for `Create5HintGame`
