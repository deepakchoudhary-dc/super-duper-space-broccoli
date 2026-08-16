const express = require('express');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const router = express.Router();

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Guardian',
      version: '1.0.0',
      description: 'Developer\'s Personal Access & Security Hub for API Management',
      contact: {
        name: 'API Guardian Support',
        url: 'https://api-guardian.com/support',
        email: 'support@api-guardian.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_GUARDIAN_DOMAIN || 'http://localhost:5000',
        description: 'API Guardian Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            twoFactorEnabled: { type: 'boolean' },
            emailVerified: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        API: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            baseUrl: { type: 'string', format: 'uri' },
            version: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive', 'maintenance'] },
            documentationUrl: { type: 'string', format: 'uri' },
            webhookUrl: { type: 'string', format: 'uri' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            keyPrefix: { type: 'string' },
            apiId: { type: 'string', format: 'uuid' },
            permissions: { type: 'object' },
            rateLimit: { type: 'integer' },
            rateLimitWindow: { type: 'integer' },
            status: { type: 'string', enum: ['active', 'inactive', 'revoked'] },
            expiresAt: { type: 'string', format: 'date-time' },
            lastUsed: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: {
              type: 'array',
              items: { type: 'object' }
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization endpoints'
      },
      {
        name: 'Users',
        description: 'User profile and account management'
      },
      {
        name: 'APIs',
        description: 'API registration and management'
      },
      {
        name: 'API Keys',
        description: 'API key generation and management'
      },
      {
        name: 'Proxy',
        description: 'API gateway and proxy functionality'
      },
      {
        name: 'Analytics',
        description: 'Usage analytics and monitoring'
      }
    ]
  },
  // FIXED: previously `./routes/*.js` resolved relative to process.cwd()
  // (the repo root when running `npm run dev`), so swagger-jsdoc found 0 files.
  // Now resolves to the actual routes directory regardless of cwd.
  apis: [path.join(__dirname, '*.js')],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Serve Swagger UI
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerSpec, {
  customCss: `
    .topbar-wrapper img { content: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAzMCAzMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMwIiBoZWlnaHQ9IjMwIiByeD0iNSIgZmlsbD0iIzIxOTZGMyIvPgo8cGF0aCBkPSJNMTUgOEwxOSAxMkwxNSAxNkwxMSAxMkwxNSA4WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTE1IDE2TDE5IDIwTDE1IDI0TDExIDIwTDE1IDE2WiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+'); width: auto; height: 30px; }
    .topbar-wrapper .link { display: none; }
    .swagger-ui .topbar { background-color: #2196F3; }
  `,
  customSiteTitle: 'API Guardian - API Documentation'
}));

// Serve raw OpenAPI spec
router.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

module.exports = router;
