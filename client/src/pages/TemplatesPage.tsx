import { Pause, Play, Plus, Repeat, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { EmptyState, ErrorBanner } from '../components/PageStates';
import { useToast } from '../components/Toast';
import { formatDay } from '../format';
import { todayIso } from '../timetable';
import { PRIORITIES, PRIORITY_LABELS, type Employee, type Priority, type Repeat as RepeatKind, type Template, type TemplateInput } from '../types';
import { useProjects } from '../useProjects';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const REPEAT_LABELS: Record<RepeatKind, string> = {
  none: 'Does not repeat',
  daily: 'Every working day',
  weekly: 'Every week',
  monthly: 'Every month',
  interval: 'Every few days',
};

const blank = (): TemplateInput => ({
  name: '',
  title: '',
  description: '',
  projectId: '',
  assigneeId: null,
  priority: 'medium',
  checklist: [],
  repeat: 'none',
  weekdays: [1],
  monthDay: 1,
  intervalDays: 7,
  startDate: todayIso(),
  endDate: null,
  leadDays: 3,
  paused: false,
});

/** Reusable tasks, and the schedules that create them automatically. Admin only. */
export function TemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** 'new', a template id being edited, or null */
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .listTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof ApiError ? err.message : "We couldn't load templates."));
  }, []);

  useEffect(() => {
    load();
    api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, [load]);

  async function togglePause(t: Template) {
    try {
      await api.updateTemplate(t.id, { ...toInput(t), paused: !t.paused });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't update that template.");
    }
  }

  async function remove(t: Template) {
    try {
      await api.deleteTemplate(t.id);
      toast({ message: `Deleted the template "${t.name}". Tasks it already made stay.` });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't delete that template.");
    }
  }

  return (
    <main className="page page-narrow templates-page">
      <div className="page-head">
        <div>
          <h1>Templates</h1>
          <p className="page-summary">Reusable tasks. Give one a schedule and the tasks are created for you.</p>
        </div>
        {editing !== 'new' && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            New template
          </button>
        )}
      </div>

      {editing === 'new' && (
        <TemplateForm
          employees={employees}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {error && <ErrorBanner message={error} onRetry={load} />}

      {templates && templates.length === 0 && editing !== 'new' && (
        <EmptyState title="No templates yet.">
          <p>Make one for work that comes round again, like a monthly payroll check or a weekly report.</p>
        </EmptyState>
      )}

      {templates && templates.length > 0 && (
        <ul className="template-list">
          {templates.map((t) =>
            editing === t.id ? (
              <li key={t.id} className="template-row is-editing">
                <TemplateForm
                  template={t}
                  employees={employees}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    load();
                  }}
                />
              </li>
            ) : (
              <li key={t.id} className={`template-row${t.paused ? ' is-paused' : ''}`}>
                <div className="template-main">
                  <div className="template-title-line">
                    <i className={`project-swatch line-${t.project.colourIndex % 8}`} aria-hidden="true" />
                    <span className="template-name">{t.name}</span>
                    {t.repeat !== 'none' && (
                      <span className={`template-badge${t.paused ? ' is-paused' : ''}`}>
                        {t.paused ? <Pause size={12} weight="bold" aria-hidden="true" /> : <Repeat size={12} weight="bold" aria-hidden="true" />}
                        {t.paused ? 'Paused' : t.schedule}
                      </span>
                    )}
                  </div>
                  <span className="template-meta">
                    {t.title} · {t.project.name} · {t.assignee ? t.assignee.name : 'No one assigned'} · {PRIORITY_LABELS[t.priority]} priority
                    {t.checklist.length > 0 && ` · ${t.checklist.length} checklist step${t.checklist.length === 1 ? '' : 's'}`}
                  </span>
                  {t.repeat !== 'none' && !t.paused && (
                    <span className="template-next">
                      {t.nextDeadline ? `Next task due ${formatDay(t.nextDeadline)}, created ${t.leadDays === 0 ? 'that day' : `${t.leadDays} day${t.leadDays === 1 ? '' : 's'} before`}.` : 'No more dates: the schedule has ended.'}
                    </span>
                  )}
                </div>
                <div className="template-actions">
                  {t.repeat !== 'none' && (
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => togglePause(t)}>
                      {t.paused ? <Play size={14} weight="bold" aria-hidden="true" /> : <Pause size={14} weight="bold" aria-hidden="true" />}
                      {t.paused ? 'Resume' : 'Pause'}
                    </button>
                  )}
                  <button type="button" className="btn btn-quiet btn-small" onClick={() => setEditing(t.id)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-link comment-delete" onClick={() => remove(t)}>
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </main>
  );
}

/** The editable fields of a saved template. */
function toInput(t: Template): TemplateInput {
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    projectId: t.projectId,
    assigneeId: t.assigneeId,
    priority: t.priority,
    checklist: t.checklist,
    repeat: t.repeat,
    weekdays: t.weekdays,
    monthDay: t.monthDay,
    intervalDays: t.intervalDays,
    startDate: t.startDate,
    endDate: t.endDate,
    leadDays: t.leadDays,
    paused: t.paused,
  };
}

function TemplateForm({
  template,
  employees,
  onCancel,
  onSaved,
}: {
  template?: Template;
  employees: Employee[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const projects = useProjects();
  const [form, setForm] = useState<TemplateInput>(() => (template ? toInput(template) : blank()));
  const [step, setStep] = useState('');
  const [preview, setPreview] = useState<{ schedule: string; dates: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof TemplateInput>(key: K, value: TemplateInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Preview the next dates whenever the schedule changes.
  const ruleKey = JSON.stringify([form.projectId, form.repeat, form.weekdays, form.monthDay, form.intervalDays, form.startDate, form.endDate]);
  useEffect(() => {
    if (form.repeat === 'none' || !form.projectId) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .previewSchedule({ projectId: form.projectId, repeat: form.repeat, weekdays: form.weekdays, monthDay: form.monthDay, intervalDays: form.intervalDays, startDate: form.startDate, endDate: form.endDate })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [ruleKey]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.title.trim() || !form.description.trim() || !form.projectId) {
      setError('Fill in the name, task title, description and project.');
      return;
    }
    if (form.repeat !== 'none' && !form.assigneeId) {
      setError('A repeating template needs someone to assign the tasks to.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (template) await api.updateTemplate(template.id, form);
      else await api.createTemplate(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't save the template.");
      setSaving(false);
    }
  }

  return (
    <form className="template-form" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()} noValidate>
      <h2 className="composer-heading">{template ? 'Edit template' : 'New template'}</h2>

      <div className="composer-grid">
        <label className="field field-title">
          <span className="field-label">Template name</span>
          <input value={form.name} maxLength={100} autoFocus placeholder="For example: Monthly payroll check" onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field field-title">
          <span className="field-label">Task title</span>
          <input value={form.title} maxLength={150} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Project</span>
          <select value={form.projectId} onChange={(e) => set('projectId', e.target.value)}>
            <option value="">Choose a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Assign to</span>
          <select value={form.assigneeId ?? ''} onChange={(e) => set('assigneeId', e.target.value || null)}>
            <option value="">{form.repeat === 'none' ? 'Choose when using it' : 'Choose an employee'}</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="field">
          <legend className="field-label">Priority</legend>
          <div className="segmented">
            {PRIORITIES.map((p) => (
              <label key={p} className="segment">
                <input type="radio" name="template-priority" checked={form.priority === p} onChange={() => set('priority', p as Priority)} />
                <span>{PRIORITY_LABELS[p]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field field-description">
          <span className="field-label">Description</span>
          <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </label>
      </div>

      <fieldset className="field template-steps">
        <legend className="field-label">Checklist (optional)</legend>
        {form.checklist.length > 0 && (
          <ol className="template-step-list">
            {form.checklist.map((s, i) => (
              <li key={`${i}-${s}`}>
                <span>{s}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove "${s}"`}
                  onClick={() => set('checklist', form.checklist.filter((_, j) => j !== i))}
                >
                  <X size={14} weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="checklist-add">
          <input
            value={step}
            maxLength={200}
            placeholder="Add a step"
            aria-label="New checklist step"
            onChange={(e) => setStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (step.trim()) {
                  set('checklist', [...form.checklist, step.trim()]);
                  setStep('');
                }
              }
            }}
          />
          <button
            type="button"
            className="btn btn-quiet btn-small"
            disabled={!step.trim()}
            onClick={() => {
              set('checklist', [...form.checklist, step.trim()]);
              setStep('');
            }}
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            Add
          </button>
        </div>
      </fieldset>

      <fieldset className="field template-repeat">
        <legend className="field-label">Repeat</legend>
        <select value={form.repeat} onChange={(e) => set('repeat', e.target.value as RepeatKind)} aria-label="Repeat">
          {(Object.keys(REPEAT_LABELS) as RepeatKind[]).map((r) => (
            <option key={r} value={r}>
              {REPEAT_LABELS[r]}
            </option>
          ))}
        </select>

        {form.repeat === 'weekly' && (
          <div className="weekday-picker" role="group" aria-label="On these days">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className={`weekday${form.weekdays.includes(i) ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={form.weekdays.includes(i)}
                  onChange={() => set('weekdays', form.weekdays.includes(i) ? form.weekdays.filter((x) => x !== i) : [...form.weekdays, i].sort())}
                />
                {d}
              </label>
            ))}
          </div>
        )}
        {form.repeat === 'monthly' && (
          <label className="inline-field">
            On day
            <input type="number" min={1} max={31} value={form.monthDay ?? 1} onChange={(e) => set('monthDay', Number(e.target.value) || 1)} />
            of the month
          </label>
        )}
        {form.repeat === 'interval' && (
          <label className="inline-field">
            Every
            <input type="number" min={2} max={365} value={form.intervalDays ?? 7} onChange={(e) => set('intervalDays', Number(e.target.value) || 2)} />
            days
          </label>
        )}

        {form.repeat !== 'none' && (
          <>
            <div className="template-dates">
              <label className="field">
                <span className="field-label">Starts</span>
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Ends (optional)</span>
                <input type="date" value={form.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || null)} />
              </label>
              <label className="field">
                <span className="field-label">Create the task</span>
                <select value={form.leadDays} onChange={(e) => set('leadDays', Number(e.target.value))}>
                  {[0, 1, 2, 3, 5, 7, 14].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? 'On the day it is due' : `${n} day${n === 1 ? '' : 's'} before it is due`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="field-hint">Dates that land on a weekend or a day off in the project move to the next working day.</p>
            {preview && (
              <div className="schedule-preview">
                <strong>{preview.schedule}.</strong> Next due: {preview.dates.length ? preview.dates.map((d) => formatDay(d)).join(' · ') : 'none (check the dates)'}
              </div>
            )}
          </>
        )}
      </fieldset>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="composer-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : template ? 'Save template' : 'Create template'}
        </button>
      </div>
    </form>
  );
}
