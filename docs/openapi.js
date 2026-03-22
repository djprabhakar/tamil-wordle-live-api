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
          word: { type: 'string', example: 'car' },
          category: { type: 'string', example: 'thing' },
          clues: {
            type: 'array',
            items: { type: 'string' },
            minItems: 5,
            maxItems: 5,
          },
        },
        required: ['word', 'category', 'clues'],
      },
      WordExistsResponse: {
        type: 'object',
        properties: {
          exists: { type: 'boolean' },
          word: { type: 'string' },
          category: { type: 'string' },
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
              word: { type: 'string', example: 'Back In Black - AC/DC' },
              category: { type: 'string', example: "80's Rock Hits" },
              clues: {
                type: 'array',
                items: { type: 'string' },
                minItems: 5,
                maxItems: 5,
              },
              id: { type: 'integer', example: 1 },
            },
            required: ['word', 'clues'],
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
      HintWordCategoriesResponse: {
        type: 'object',
        properties: {
          categories: {
            type: 'array',
            items: { type: 'string' },
            example: ['80\'s Rock Hits', 'Common'],
          },
        },
        required: ['categories'],
      },
      TwentyWordsResponse: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          fileName: { type: 'string' },
          count: { type: 'integer' },
          data: {
            type: 'array',
            items: { type: 'object' },
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
    '/api/words/Get20RandomWordsWith5Clues': {
      get: {
        tags: ['Words'],
        summary: 'Get up to 20 random word entries with 5 clues from a category file',
        parameters: [
          { in: 'query', name: 'category', required: true, schema: { type: 'string' } },
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
