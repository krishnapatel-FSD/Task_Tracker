import { Router } from 'express';
import { z } from 'zod';
import { forbidden, notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as projectService from '../services/projectService.js';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '../validation/schemas.js';

export const projectsRouter = Router();

projectsRouter.use(authenticate);

// ?all=true (admin only) includes archived projects and task counts.
// ?board=true returns the projects home with per-project counts for the viewer.
projectsRouter.get('/', validate(listProjectsQuerySchema, 'query'), async (req, res) => {
  const query = res.locals.query as { all?: string; board?: string };
  if (query.board === 'true') {
    return res.json(await projectService.listProjectBoard(req.user!));
  }
  if (query.all === 'true') {
    if (req.user!.role !== 'admin') throw forbidden();
    return res.json(await projectService.listAllProjects());
  }
  res.json(await projectService.listActiveProjects());
});

projectsRouter.post('/', requireRole('admin'), validate(createProjectSchema), async (_req, res) => {
  res.status(201).json(await projectService.createProject(res.locals.body as CreateProjectInput));
});

projectsRouter.patch('/:id', requireRole('admin'), validate(updateProjectSchema), async (req, res) => {
  if (!z.uuid().safeParse(req.params.id).success) throw notFound('Project not found');
  res.json(await projectService.updateProject(req.params.id as string, res.locals.body as UpdateProjectInput));
});
