import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { buildRouter } from './routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  // Demonstração na rede local, sem login nem cookies: qualquer origem pode chamar a API.
  // (No uso normal o app chama /api pelo proxy do Vite, na mesma origem.)
  app.use(cors());
  app.use(express.json({ limit: '16kb' }));

  app.use('/api', buildRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
