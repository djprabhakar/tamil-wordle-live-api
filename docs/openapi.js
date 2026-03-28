const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Tamil Wordle Live API',
    version: '1.0.0',
    description: 'Express API for words data and live games.',
  },
  servers: [
    {
      url: 'http://localhost:4000',
    },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Words' },
    { name: 'Live Games' },
  ],
  components: {
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: {},
        },
        required: ['error'],
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
        },
        required: ['status'],
      },
      WordRecord: {
        type: 'object',
        properties: {
          answer: { type: 'string', example: 'car' },
          title: { type: 'string', example: 'thing' },
          clues: {
            type: 'array',
            items: { type: 'string' },
            minItems: 5,
            maxItems: 5,
          },
        },
        required: ['answer', 'title', 'clues'],
      },
      WordExistsResponse: {
        type: 'object',
        properties: {
          exists: { type: 'boolean' },
          answer: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['exists'],
      },
      RandomSetResponse: {
        type: 'object',
        properties: {
          count: { type: 'integer', example: 10 },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/WordRecord' },
          },
        },
        required: ['count', 'data'],
      },
      PaginatedWordsResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/WordRecord' },
          },
          pagination: {
            type: 'object',
            nullable: true,
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
        required: ['data', 'pagination'],
      },
      SaveA5HintWordRequest: {
        type: 'object',
        properties: {
          category: { type: 'string', example: 'Common' },
          wordEntry: {
            type: 'object',
            properties: {
              answer: { type: 'string', example: 'Back In Black' },
              category: { type: 'string', example: "80's Rock Hits" },
              title: {
                type: 'string',
                example: 'A legendary comeback hard-rock anthem by AC/DC released in 1980',
              },
              clues: {
                type: 'array',
                items: { type: 'string' },
                minItems: 5,
                maxItems: 5,
              },
              id: { type: 'integer', example: 1 },
            },
            required: ['clues'],
            additionalProperties: true,
          },
        },
        required: ['category', 'wordEntry'],
      },
      SaveA5HintWordResponse: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          fileName: { type: 'string' },
          saved: { type: 'object' },
          totalEntries: { type: 'integer' },
        },
        required: ['category', 'fileName', 'saved', 'totalEntries'],
      },
      Create5HintGameRequest: {
        type: 'object',
        properties: {
          category: { type: 'string', example: 'audio-songs' },
          game_name: { type: 'string', example: 'Greatest Classic Rock Hits' },
          notes: {
            type: 'object',
            properties: {
              NoOfWords: { type: 'integer', example: 3 },
              GamePrompt: {
                type: 'string',
                example: 'Make the overall game feel dramatic and accessible to casual music fans.',
              },
              AudioPrompt: {
                type: 'string',
                example: 'After the clues, add a media object using the best karaoke-style YouTube result for the answer.',
              },
              TitlePrompt: {
                type: 'string',
                example: 'Make the title feel like a magazine blurb.',
              },
              CluesPrompt: {
                type: 'string',
                example: 'Start broad and end with one iconic clue.',
              },
            },
          },
          nick_name: { type: 'string', example: 'prabhakar' },
          audio_enabled: { type: 'boolean', example: true },
        },
        required: ['category', 'game_name', 'nick_name'],
      },
      Create5HintGameResponse: {
        type: 'object',
        properties: {
          category: { type: 'string', example: 'audio-songs' },
          game_name: { type: 'string', example: 'Greatest Classic Rock Hits' },
          fileName: { type: 'string', example: '80s_Rock_Hits.json' },
          promptFile: { type: 'string', example: '80s_Rock_Hits.prompt.json' },
          created: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer', example: 51 },
                category: { type: 'string', example: 'audio-songs' },
                game_name: { type: 'string', example: "80's Rock Hits" },
                answer: { type: 'string', example: 'Another Brick in the Wall (Part 2)' },
                title: {
                  type: 'string',
                  example: "A protest-themed rock track by Pink Floyd featuring a children's chorus",
                },
                clues: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 5,
                  maxItems: 5,
                },
                media: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', example: 'youtube' },
                    videoId: { type: 'string', example: 'ZRzKfpPXXXc' },
                    start: { type: 'integer', example: 0 },
                    duration: { type: 'integer', example: 30 },
                  },
                },
                created_by: { type: 'string', example: 'prabhakar' },
              },
              required: ['id', 'category', 'game_name', 'answer', 'title', 'clues', 'created_by'],
            },
          },
          totalCreated: { type: 'integer', example: 3 },
          totalEntries: { type: 'integer', example: 51 },
        },
        required: ['category', 'game_name', 'fileName', 'promptFile', 'created', 'totalCreated', 'totalEntries'],
      },
      Create5HintGameJobAcceptedResponse: {
        type: 'object',
        properties: {
          jobId: { type: 'string', example: 'JABC1234' },
          status: { type: 'string', example: 'queued' },
          category: { type: 'string', example: 'audio-songs' },
          game_name: { type: 'string', example: 'Greatest Classic Rock Hits' },
          nick_name: { type: 'string', example: 'prabhakar' },
          queuedAt: { type: 'integer', example: 1743200000000 },
          statusUrl: { type: 'string', example: '/api/words/Create5HintGameJobs/JABC1234' },
        },
        required: ['jobId', 'status', 'category', 'game_name', 'nick_name', 'queuedAt', 'statusUrl'],
      },
      Create5HintGameJobStatusResponse: {
        type: 'object',
        properties: {
          jobId: { type: 'string', example: 'JABC1234' },
          status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed'] },
          category: { type: 'string', example: 'audio-songs' },
          game_name: { type: 'string', example: 'Greatest Classic Rock Hits' },
          nick_name: { type: 'string', example: 'prabhakar' },
          queuedAt: { type: 'integer', example: 1743200000000 },
          startedAt: { type: 'integer', nullable: true, example: 1743200001000 },
          finishedAt: { type: 'integer', nullable: true, example: 1743200009000 },
          result: {
            anyOf: [
              { $ref: '#/components/schemas/Create5HintGameResponse' },
              { type: 'null' },
            ],
          },
          error: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  message: { type: 'string', example: 'OpenAI request failed.' },
                  details: { type: 'object', nullable: true, additionalProperties: true },
                  statusCode: { type: 'integer', example: 502 },
                },
                required: ['message', 'statusCode'],
              },
              { type: 'null' },
            ],
          },
        },
        required: ['jobId', 'status', 'category', 'game_name', 'nick_name', 'queuedAt', 'startedAt', 'finishedAt', 'result', 'error'],
      },
      Create5HintGameEnvironmentResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          checks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', example: 'OPENAI_API_KEY' },
                ok: { type: 'boolean', example: true },
                message: { type: 'string', example: 'Configured.' },
              },
              required: ['name', 'ok', 'message'],
            },
          },
        },
        required: ['ok', 'checks'],
      },
      HintWordCategoriesResponse: {
        type: 'object',
        properties: {
          categories: {
            type: 'array',
            items: { type: 'string' },
            example: ['audio-songs', 'common'],
          },
        },
        required: ['categories'],
      },
      HintWordBeginningWithResponse: {
        type: 'object',
        properties: {
          category: { type: 'string', example: "80's Rock Hits" },
          fileName: { type: 'string', example: '80s_Rock_Hits.json' },
          startsWith: { type: 'string', example: 'Ba' },
          count: { type: 'integer', example: 2 },
          words: {
            type: 'array',
            items: { type: 'string' },
            example: ['Back In Black - AC/DC', 'Bad Medicine - Bon Jovi'],
          },
        },
        required: ['category', 'fileName', 'startsWith', 'count', 'words'],
      },
      TwentyWordsResponse: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          fileName: { type: 'string' },
          count: { type: 'integer' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer', example: 1 },
                answer: { type: 'string', example: 'Back In Black' },
                category: { type: 'string', example: "80's Rock Hits" },
                title: {
                  type: 'string',
                  example: 'A legendary comeback hard-rock anthem by AC/DC released in 1980',
                },
                band: { type: 'string', example: 'AC/DC' },
                clues: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 5,
                  maxItems: 5,
                },
                audio: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', example: 'youtube' },
                    videoId: { type: 'string', example: 'PULC--cvxxI' },
                    start: { type: 'integer', example: 15 },
                    duration: { type: 'integer', example: 10 },
                  },
                },
              },
              required: ['answer', 'category', 'clues'],
            },
          },
        },
        required: ['category', 'fileName', 'count', 'data'],
      },
      LiveGame: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          word: { type: 'string' },
          wordLength: { type: 'integer', enum: [4, 5] },
          hostPlayerId: { type: 'string' },
          hostNickname: { type: 'string' },
          createdAt: { type: 'integer' },
          participantPlayerIds: { type: 'array', items: { type: 'string' } },
          successfulPlayerIds: { type: 'array', items: { type: 'string' } },
          unsuccessfulPlayerIds: { type: 'array', items: { type: 'string' } },
          totalParticipants: { type: 'integer' },
          successfulParticipants: { type: 'integer' },
          unsuccessfulParticipants: { type: 'integer' },
        },
        required: ['id', 'word', 'wordLength', 'hostPlayerId', 'hostNickname', 'createdAt'],
      },
      CreateLiveGameRequest: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          word: { type: 'string' },
          wordLength: { type: 'integer', enum: [4, 5] },
          hostPlayerId: { type: 'string' },
          hostNickname: { type: 'string' },
          createdAt: { type: 'integer' },
          participantPlayerIds: { type: 'array', items: { type: 'string' } },
          successfulPlayerIds: { type: 'array', items: { type: 'string' } },
          unsuccessfulPlayerIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['word', 'wordLength', 'hostPlayerId', 'hostNickname'],
      },
      ParticipationRequest: {
        type: 'object',
        properties: {
          playerId: { type: 'string' },
          outcome: { type: 'string', enum: ['success', 'failure'] },
        },
        required: ['playerId', 'outcome'],
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
    '/api/words/categories': {
      get: {
        tags: ['Words'],
        summary: 'List word categories',
        responses: {
          200: {
            description: 'Available categories',
          },
        },
      },
    },
    '/api/words/random': {
      get: {
        tags: ['Words'],
        summary: 'Get one random word',
        parameters: [
          { in: 'query', name: 'category', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Random word record',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WordRecord' },
              },
            },
          },
        },
      },
    },
    '/api/words/random-set': {
      get: {
        tags: ['Words'],
        summary: 'Get a random set of words',
        parameters: [
          { in: 'query', name: 'count', required: true, schema: { type: 'integer', minimum: 1 } },
          { in: 'query', name: 'category', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Random word set',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RandomSetResponse' },
              },
            },
          },
        },
      },
    },
    '/api/words/all': {
      get: {
        tags: ['Words'],
        summary: 'List words with optional pagination',
        parameters: [
          { in: 'query', name: 'category', schema: { type: 'string' } },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1 } },
          { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } },
          { in: 'query', name: 'shuffle', schema: { type: 'boolean' } },
        ],
        responses: {
          200: {
            description: 'Words list',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { type: 'array', items: { $ref: '#/components/schemas/WordRecord' } },
                    { $ref: '#/components/schemas/PaginatedWordsResponse' },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/words/{word}': {
      get: {
        tags: ['Words'],
        summary: 'Get a word by value',
        parameters: [
          { in: 'path', name: 'word', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Word record',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WordRecord' },
              },
            },
          },
        },
      },
    },
    '/api/words/check': {
      post: {
        tags: ['Words'],
        summary: 'Check whether a word exists',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  guess: { type: 'string' },
                },
                required: ['guess'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Word existence result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WordExistsResponse' },
              },
            },
          },
        },
      },
    },
    '/api/words/SaveA5HintWord': {
      post: {
        tags: ['Words'],
        summary: 'Save a word entry with 5 clues into a category-backed JSON file',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SaveA5HintWordRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Entry saved',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SaveA5HintWordResponse' },
              },
            },
          },
        },
      },
    },
    '/api/words/Create5HintGame': {
      post: {
        tags: ['Words'],
        summary: 'Queue a background job to generate and save new 5-hint game entries using the OpenAI API',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Create5HintGameRequest' },
            },
          },
        },
        responses: {
          202: {
            description: 'Job queued',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Create5HintGameJobAcceptedResponse' },
              },
            },
          },
        },
      },
    },
    '/api/words/Create5HintGameJobs/{jobId}': {
      get: {
        tags: ['Words'],
        summary: 'Get the status of a queued Create5HintGame job',
        parameters: [
          { in: 'path', name: 'jobId', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Job status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Create5HintGameJobStatusResponse' },
              },
            },
          },
        },
      },
    },
    '/api/words/Create5HintGameEnvironment': {
      get: {
        tags: ['Words'],
        summary: 'Check whether the Create5HintGame environment is configured correctly',
        responses: {
          200: {
            description: 'Environment diagnostics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Create5HintGameEnvironmentResponse' },
              },
            },
          },
        },
      },
    },
    '/api/words/Get5HintWordCategories': {
      get: {
        tags: ['Words'],
        summary: 'Get available 5-clue word categories from the category-file-map',
        responses: {
          200: {
            description: 'Available mapped categories',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HintWordCategoriesResponse' },
              },
            },
          },
        },
      },
    },
    '/api/words/Get5HintWordBeginningWith': {
      get: {
        tags: ['Words'],
        summary: 'Get all words in a category file that begin with the provided string',
        parameters: [
          { in: 'query', name: 'category', required: true, schema: { type: 'string' } },
          { in: 'query', name: 'startsWith', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Matching words',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HintWordBeginningWithResponse' },
              },
            },
          },
        },
      },
    },
    '/api/words/Get20RandomWordsWith5Clues': {
      get: {
        tags: ['Words'],
        summary: 'Get up to 20 random word entries with 5 clues from a category file',
        parameters: [
          { in: 'query', name: 'game', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Random entries',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TwentyWordsResponse' },
              },
            },
          },
        },
      },
    },
    '/live-games': {
      get: {
        tags: ['Live Games'],
        summary: 'List live games',
        responses: {
          200: {
            description: 'Live games',
          },
        },
      },
      post: {
        tags: ['Live Games'],
        summary: 'Create a live game',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateLiveGameRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Game created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LiveGame' },
              },
            },
          },
        },
      },
    },
    '/live-games/{id}': {
      get: {
        tags: ['Live Games'],
        summary: 'Get one live game by id',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Live game',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LiveGame' },
              },
            },
          },
        },
      },
    },
    '/live-games/{id}/participation': {
      post: {
        tags: ['Live Games'],
        summary: 'Record participation outcome for a game',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ParticipationRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated live game',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LiveGame' },
              },
            },
          },
        },
      },
    },
  },
}

module.exports = {
  openapi,
}
