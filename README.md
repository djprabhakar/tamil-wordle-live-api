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
    "word": "car",
    "category": "thing",
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
- `POST /api/words/SaveA5HintWord`
- `GET /api/words/Get5HintWordCategories`
- `GET /api/words/Get20RandomWordsWith5Clues?category=Common`

### curl examples

```bash
curl http://localhost:4000/health
curl http://localhost:4000/openapi.json
curl http://localhost:4000/api/words/categories
curl http://localhost:4000/api/words/Get5HintWordCategories
curl "http://localhost:4000/api/words/random?category=thing"
curl "http://localhost:4000/api/words/random-set?count=10&category=thing"
curl "http://localhost:4000/api/words/all?limit=10&page=1"
curl http://localhost:4000/api/words/car
curl -X POST http://localhost:4000/api/words/check ^
  -H "Content-Type: application/json" ^
  -d "{\"guess\":\"car\"}"
curl -X POST http://localhost:4000/api/words/SaveA5HintWord ^
  -H "Content-Type: application/json" ^
  -d "{\"category\":\"Common\",\"wordEntry\":{\"word\":\"plane\",\"category\":\"thing\",\"clues\":[\"wings\",\"travel\",\"airport\",\"pilot\",\"sky\"]}}"
curl "http://localhost:4000/api/words/Get20RandomWordsWith5Clues?category=Common"
```

Response from `POST /api/words/check`:

```json
{
  "exists": true,
  "word": "car",
  "category": "thing"
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
    "word": "plane",
    "category": "thing",
    "clues": ["wings", "travel", "airport", "pilot", "sky"]
  },
  "totalEntries": 501
}
```

Behavior:

- category-to-file mapping is stored in `data/category-file-map.json`
- if a category does not exist, the API creates a new mapping entry
- the new filename is derived from the category name, for example `Movie Titles` -> `Movie_Titles.json`
- `WordEntry` must be a JSON object with a non-empty `word` and exactly 5 non-empty `clues`

Response from `GET /api/words/Get20RandomWordsWith5Clues?category=Common`:

```json
{
  "category": "Common",
  "fileName": "common_500_words_with_5_clues.json",
  "count": 20,
  "data": [
    {
      "word": "car",
      "category": "thing",
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
