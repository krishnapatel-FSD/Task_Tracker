import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { daysBetween } from '../lib/dates.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as reportService from '../services/reportService.js';
import * as weeklyReportService from '../services/weeklyReportService.js';
import { dateString } from '../validation/schemas.js';

export const reportsRouter = Router();

reportsRouter.use(authenticate, requireRole('admin'));

const filtersSchema = z
  .object({
    from: dateString('from'),
    to: dateString('to'),
    projectId: z.uuid('projectId must be a valid id').optional(),
    assigneeId: z.uuid('assigneeId must be a valid id').optional(),
  })
  .refine((f) => f.from <= f.to, 'from must be on or before to')
  .refine((f) => daysBetween(f.from, f.to) <= 366, 'The range can be at most one year');

type Filters = z.infer<typeof filtersSchema>;
const filters = (res: { locals: Record<string, unknown> }) => res.locals.query as Filters;

const exportLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
  message: { error: 'Too many exports. Wait a minute and try again.' },
});

reportsRouter.get('/summary', validate(filtersSchema, 'query'), async (_req, res) => {
  res.json(await reportService.summary(filters(res)));
});

reportsRouter.get('/throughput', validate(filtersSchema, 'query'), async (_req, res) => {
  res.json(await reportService.throughput(filters(res)));
});

const groupBySchema = z.object({ groupBy: z.enum(['project', 'employee']).default('project') });

reportsRouter.get('/status-breakdown', validate(filtersSchema, 'query'), async (req, res) => {
  const parsed = groupBySchema.safeParse({ groupBy: req.query.groupBy });
  if (!parsed.success) return res.status(400).json({ error: 'groupBy must be project or employee' });
  res.json(await reportService.statusBreakdown(filters(res), parsed.data.groupBy));
});

reportsRouter.get('/projects', validate(filtersSchema, 'query'), async (_req, res) => {
  res.json(await reportService.projectTable(filters(res)));
});

reportsRouter.get('/employees', validate(filtersSchema, 'query'), async (_req, res) => {
  res.json(await reportService.employeeTable(filters(res)));
});

reportsRouter.get('/overdue', validate(filtersSchema, 'query'), async (_req, res) => {
  res.json(await reportService.overdueList(filters(res)));
});

reportsRouter.get('/activity', validate(filtersSchema, 'query'), async (_req, res) => {
  res.json(await reportService.recentActivity(filters(res)));
});

const exportTypeSchema = z.object({ type: z.enum(['projects', 'employees', 'tasks'], 'type must be projects, employees or tasks') });

reportsRouter.get('/export.csv', exportLimiter, validate(filtersSchema, 'query'), async (req, res) => {
  const parsed = exportTypeSchema.safeParse({ type: req.query.type });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const f = filters(res);
  const csv = await reportService.exportCsv(parsed.data.type, f);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${parsed.data.type}-${f.from}-to-${f.to}.csv"`);
  res.send('\uFEFF' + csv);
});

// ---- Weekly snapshots -------------------------------------------------------------

const weekParam = z.object({ weekStart: dateString('weekStart') });

reportsRouter.get('/weekly', async (_req, res) => {
  res.json(await weeklyReportService.listWeeklyReports());
});

reportsRouter.get('/weekly/:weekStart', async (req, res) => {
  const parsed = weekParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(await weeklyReportService.getWeeklyReport(parsed.data.weekStart));
});

reportsRouter.get('/weekly/:weekStart/export.csv', exportLimiter, async (req, res) => {
  const parsed = weekParam.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const report = await weeklyReportService.getWeeklyReport(parsed.data.weekStart);
  if (report.status !== 'ready') return res.status(409).json({ error: 'That report failed to generate. Generate it again.' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="weekly-report-${parsed.data.weekStart}.csv"`);
  res.send('\uFEFF' + weeklyReportService.weeklyCsv(report.data as unknown as weeklyReportService.WeeklySnapshot));
});

/** "Generate now": builds (or rebuilds) one week. Body: { weekStart } (a Monday). */
reportsRouter.post('/weekly', validate(weekParam), async (req, res) => {
  const { weekStart } = res.locals.body as z.infer<typeof weekParam>;
  const saved = await weeklyReportService.generateWeeklyReport(weekStart, req.user!.id);
  res.status(saved.status === 'ready' ? 201 : 500).json(saved);
});
