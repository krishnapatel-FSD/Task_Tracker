import { Router } from 'express';
import { z } from 'zod';
import { forbidden, notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as projectService from '../services/projectService.js';
import {
  holidaySchema,
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

const projectId: (req: { params: Record<string, string | string[] | undefined> }) => string = (req) => {
  const id = req.params.id as string;
  if (!z.uuid().safeParse(id).success) throw notFound('Project not found');
  return id;
};

// Days off, shown on the calendar. Read by anyone; changed by the admin.
projectsRouter.get('/:id/holidays', async (req, res) => {
  res.json(await projectService.listHolidays(projectId(req)));
});

projectsRouter.post('/:id/holidays', requireRole('admin'), validate(holidaySchema), async (req, res) => {
  res.status(201).json(await projectService.addHoliday(projectId(req), res.locals.body as { date: string; name: string }));
});

projectsRouter.delete('/:id/holidays/:date', requireRole('admin'), async (req, res) => {
  const date = req.params.date as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw notFound('Day off not found');
  res.json(await projectService.removeHoliday(projectId(req), date));
});
