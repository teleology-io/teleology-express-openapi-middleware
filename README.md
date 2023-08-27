# @teleology/express-openapi-middleware

Uses an openapi spec to validate express server endpoints


# Installation:
```
yarn add -D @teleology/express-openapi-middleware 
```

# Usage:

```typescript
import { openApiValidation } from '@teleology/express-openapi-middleware';
import express from 'express';
import spec from './spec';

const app = express();

app.use(openApiValidation(spec))
app.post('/project', handleCreateProject);
app.put('/project/:id', handleUpdateProject);

```

_spec.ts_
```typescript
export default {
  openapi: '3.0.1',
  info: {
    title: 'Example',
  },
  servers: [
    {
      url: 'http://127.0.0.1:3000',
      description: 'Generated server url',
    },
  ],
  paths: {
    '/project': {
      post: {
        requestBody: {
          description: 'Project Created',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateProject',
              },
            },
          },
          required: true,
        },
        responses: { ... },
      },
    },
    '/project/{id}': {
      put: {
        parameters: [
          {
            in: 'path',
            name: 'id',
            schema: {
              type: 'string',
              format: 'uuid',
            },
            required: true,
          },
        ],
        requestBody: {
          description: 'Project Updated',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateProject',
              },
            },
          },
          required: true,
        },
        responses: { ... },
      },
    },
  },
  components: {
    schemas: {
      CreateProject: { ... }
      UpdateProject: { ... }
    },
  },
};
```