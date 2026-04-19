import serverless from 'serverless-http';
import app from '../../backend/src/app.js';

export const handler = serverless(app, {
  binary: ['image/*', 'application/pdf', 'multipart/form-data']
});
