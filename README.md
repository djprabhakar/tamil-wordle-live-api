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
- `POST /api/words/SaveA5HintWord`
- `GET /api/words/Get5HintWordCategories`
- `GET /api/words/Get5HintWordBeginningWith?category=Common&startsWith=ca`
- `GET /api/words/Get20RandomWordsWith5Clues?category=Common`

### curl examples

```bash
curl http://localhost:4000/health
curl http://localhost:4000/openapi.json
curl http://localhost:4000/api/words/categories
curl -X POST http://localhost:4000/api/words/Create5HintGame ^
  -H "Content-Type: application/json" ^
  -d "{\"category\":\"80's Rock Hits\",\"nick_name\":\"prabhakar\",\"audio_enabled\":true,\"notes\":{\"NoOfWords\":2,\"GamePrompt\":\"Make the overall game feel like a stadium-rock challenge.\",\"AudioPrompt\":\"After the clues, add a karaoke-focused YouTube media object for the answer.\",\"TitlePrompt\":\"Make the title punchy.\",\"CluesPrompt\":\"Go from broad to iconic.\"}}"
curl http://localhost:4000/api/words/Get5HintWordCategories
curl "http://localhost:4000/api/words/Get5HintWordBeginningWith?category=Common&startsWith=ca"
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
curl "http://localhost:4000/api/words/Get20RandomWordsWith5Clues?category=Common"
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
- if a category does not exist, the API creates a new mapping entry
- the new filename is derived from the category name, for example `Movie Titles` -> `Movie_Titles.json`
- `WordEntry` must be a JSON object with a non-empty `answer` and exactly 5 non-empty `clues`
- `POST /api/words/Create5HintGame` creates prompt files in `data/category-prompts/` when they do not already exist
- `POST /api/words/Create5HintGame` requires `OPENAI_API_KEY`; `OPENAI_MODEL` is optional and defaults to `gpt-5`
- `POST /api/words/Create5HintGame` expects `notes` as a JSON object with `NoOfWords`, `GamePrompt`, `AudioPrompt`, `TitlePrompt`, and `CluesPrompt`
- `notes.NoOfWords` controls how many entries are generated in one request, from 1 to 20
- `notes.GamePrompt` gives higher-level direction for the overall game entry beyond the title and clue-specific instructions
- `notes.AudioPrompt` overrides the default audio-generation instruction when `audio_enabled` is `true`

Response from `GET /api/words/Get20RandomWordsWith5Clues?category=Common`:

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
