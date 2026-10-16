import cors from 'cors';
import express, { Router } from 'express';
import { env } from './lib/env.js';
import { announceChanges, openLiveStream } from './lib/liveUpdates.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { attachmentsRouter, taskAttachmentsRouter } from './routes/attachments.js';
import { authRouter } from './routes/auth.js';
import { calendarRouter } from './routes/calendar.js';
import { checklistRouter, taskChecklistRouter } from './routes/checklist.js';
import { commentsRouter, taskCommentsRouter } from './routes/comments.js';
import { meRouter, notificationsRouter } from './routes/notifications.js';
import { taskHandoffsRouter } from './routes/handoffs.js';
import { progressRouter } from './routes/progress.js';
import { projectsRouter } from './routes/projects.js';
import { reportsRouter } from './routes/reports.js';
import { tasksRouter } from './routes/tasks.js';
import { usersRouter } from './routes/users.js';
// Registers the task-event listener that fans events out into notifications.
import './services/notificationService.js';

export function createApp() {
  const app = express();
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

  app.use(cors({ origin: env.CLIENT_ORIGINS, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json());

  const api = Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  // Live updates: one stream per open browser; every successful change is announced on it.
  api.use(announceChanges);
  api.get('/live', authenticate, openLiveStream);
  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/projects', projectsRouter);
  api.use('/tasks/:id/attachments', taskAttachmentsRouter);
  api.use('/attachments', attachmentsRouter);
  api.use('/tasks/:id/comments', taskCommentsRouter);
  api.use('/comments', commentsRouter);
  api.use('/tasks/:id/checklist', taskChecklistRouter);
  api.use('/tasks/:id/handoffs', taskHandoffsRouter);
  api.use('/checklist', checklistRouter);
  api.use('/calendar', calendarRouter);
  api.use('/progress', progressRouter);
  api.use('/tasks', tasksRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/me', meRouter);
  api.use('/reports', reportsRouter);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
