import { X } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { PRIORITIES, PRIORITY_LABELS, type Employee, type Priority, type ProjectRef, type Task, type TaskInput, type Template } from '../types';

interface Props {
  mode: 'create' | 'edit';
  /** create: animates open/closed above the list. edit: always open, docked under its row. */
  open?: boolean;
  initial?: Task;
  /** Render just the form (inside the task panel), without the collapsing wrapper. */
  bare?: boolean;
  /** create: preselect this project (when creating from a project page). */
  defaultProjectId?: string;
  employees: Employee[];
  projects: ProjectRef[];
  onSaved: (task: Task) => void;
  onClose: () => void;
}

type Field = keyof TaskInput;
type FormState = Record<Field, string>;

const emptyForm: FormState = { title: '', description: '', assigneeId: '', projectId: '', priority: '', deadline: '' };

function fromTask(task: Task): FormState {
  return {
    title: task.title,
    description: task.description,
    assigneeId: task.assignee.id,
    projectId: task.project.id,
    priority: task.priority,
    deadline: task.deadline,
  };
}

function validate(form: FormState) {
  const errors: Partial<Record<Field, string>> = {};
  if (!form.title.trim()) errors.title = 'Give the task a title.';
  else if (form.title.trim().length > 150) errors.title = 'Keep the title to 150 characters or fewer.';
  if (!form.projectId) errors.projectId = 'Choose a project.';
  if (!form.assigneeId) errors.assigneeId = 'Choose who this task is for.';
  if (!form.priority) errors.priority = 'Choose a priority.';
  if (!form.deadline) errors.deadline = 'Choose a deadline.';
  if (!form.description.trim()) errors.description = 'Describe what needs to be done.';
  return errors;
}

/** Inline task form. Never a modal: it opens above the list (create) or under its row (edit). */
export function TaskComposer({ mode, open = true, initial, bare = false, defaultProjectId, employees, projects, onSaved, onClose }: Props) {
  const blank = defaultProjectId ? { ...emptyForm, projectId: defaultProjectId } : emptyForm;
  const [form, setForm] = useState<FormState>(initial ? fromTask(initial) : blank);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  // create: start from a template, which also brings its checklist
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [checklist, setChecklist] = useState<string[]>([]);

  useEffect(() => {
    if (mode === 'create') api.listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, [mode]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) {
      setChecklist([]);
      return;
    }
    setForm((f) => ({
      ...f,
      title: t.title,
      description: t.description,
      projectId: defaultProjectId ?? t.projectId,
      assigneeId: t.assigneeId ?? f.assigneeId,
      priority: t.priority,
    }));
    setChecklist(t.checklist);
    setErrors({});
  }
  const idPrefix = mode === 'edit' && initial ? `edit-${initial.id}` : 'composer';

  useEffect(() => {
    if (open) {
      // Wait for the open transition, then focus without scrolling the clip.
      const timer = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), mode === 'create' && !bare ? 250 : 0);
      return () => window.clearTimeout(timer);
    }
    setForm(initial ? fromTask(initial) : blank);
    setTemplateId('');
    setChecklist([]);
    setErrors({});
    setServerError(null);
  }, [open]);

  const set = (field: Field, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`${idPrefix}-${Object.keys(found)[0]}`)?.focus();
      return;
    }

    const values: TaskInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      assigneeId: form.assigneeId,
      projectId: form.projectId,
      priority: form.priority as Priority,
      deadline: form.deadline,
    };

    setSubmitting(true);
    setServerError(null);
    try {
      if (mode === 'edit' && initial) {
        const before = fromTask(initial);
        const changes = Object.fromEntries(
          (Object.keys(values) as Field[]).filter((k) => values[k] !== before[k]).map((k) => [k, values[k]]),
        ) as Partial<TaskInput>;
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        onSaved(await api.updateTask(initial.id, changes));
      } else {
        onSaved(await api.createTask({ ...values, ...(checklist.length && { checklist }), ...(templateId && { templateId }) }));
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "We couldn't save the task. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldId = (field: Field) => `${idPrefix}-${field}`;
  const describedBy = (field: Field) => (errors[field] ? `${fieldId(field)}-error` : undefined);
  const fieldError = (field: Field) =>
    errors[field] && (
      <span id={`${fieldId(field)}-error`} className="field-error">
        {errors[field]}
      </span>
    );

  // An archived project can still be the current one in edit mode; keep it selectable.
  const projectOptions =
    initial && !projects.some((p) => p.id === initial.project.id) ? [...projects, initial.project] : projects;

  const formEl = (
    <form
      className={`composer${mode === 'edit' ? ' composer-edit' : ''}`}
      onSubmit={handleSubmit}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      noValidate
      aria-labelledby={`${idPrefix}-heading`}
    >
      <h2 id={`${idPrefix}-heading`} className="composer-heading">
        {mode === 'edit' ? 'Edit task' : 'New task'}
      </h2>

      {mode === 'create' && templates.length > 0 && (
        <label className="field composer-template">
          <span className="field-label">Start from a template (optional)</span>
          <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">Blank task</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="composer-grid">
        <label className="field field-title">
          <span className="field-label">Title</span>
          <input
            id={fieldId('title')}
            ref={titleRef}
            value={form.title}
            maxLength={150}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={describedBy('title')}
            onChange={(e) => set('title', e.target.value)}
          />
          {fieldError('title')}
        </label>

        <label className="field">
          <span className="field-label">Project</span>
          <select
            id={fieldId('projectId')}
            value={form.projectId}
            aria-invalid={Boolean(errors.projectId)}
            aria-describedby={describedBy('projectId')}
            onChange={(e) => set('projectId', e.target.value)}
          >
            <option value="">Choose a project</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {fieldError('projectId')}
        </label>

        <label className="field">
          <span className="field-label">Assignee</span>
          <select
            id={fieldId('assigneeId')}
            value={form.assigneeId}
            aria-invalid={Boolean(errors.assigneeId)}
            aria-describedby={describedBy('assigneeId')}
            onChange={(e) => set('assigneeId', e.target.value)}
          >
            <option value="">Choose an employee</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
          {fieldError('assigneeId')}
        </label>

        <fieldset className="field" aria-describedby={describedBy('priority')}>
          <legend className="field-label">Priority</legend>
          <div className="segmented" id={fieldId('priority')} tabIndex={-1}>
            {PRIORITIES.map((p) => (
              <label key={p} className="segment">
                <input
                  type="radio"
                  name={`${idPrefix}-priority`}
                  value={p}
                  checked={form.priority === p}
                  onChange={() => set('priority', p)}
                />
                <span>{PRIORITY_LABELS[p]}</span>
              </label>
            ))}
          </div>
          {fieldError('priority')}
        </fieldset>

        <label className="field">
          <span className="field-label">Deadline</span>
          <input
            id={fieldId('deadline')}
            type="date"
            value={form.deadline}
            aria-invalid={Boolean(errors.deadline)}
            aria-describedby={describedBy('deadline')}
            onChange={(e) => set('deadline', e.target.value)}
          />
          {fieldError('deadline')}
        </label>

        <label className="field field-description">
          <span className="field-label">Description</span>
          <textarea
            id={fieldId('description')}
            rows={3}
            value={form.description}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={describedBy('description')}
            onChange={(e) => set('description', e.target.value)}
          />
          {fieldError('description')}
        </label>
      </div>

      {mode === 'create' && checklist.length > 0 && (
        <div className="field composer-checklist">
          <span className="field-label">Checklist from the template</span>
          <ol className="template-step-list">
            {checklist.map((s, i) => (
              <li key={`${i}-${s}`}>
                <span>{s}</span>
                <button type="button" className="icon-button" aria-label={`Remove "${s}"`} onClick={() => setChecklist((l) => l.filter((_, j) => j !== i))}>
                  <X size={14} weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {serverError && (
        <p className="banner banner-error" role="alert">
          {serverError}
        </p>
      )}

      <div className="composer-actions">
        {mode === 'create' && <span className="composer-hint">New tasks start as To do.</span>}
        <button type="button" className="btn btn-quiet" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create task'}
        </button>
      </div>
    </form>
  );

  if (mode === 'edit' || bare) return formEl;

  return (
    <div className={`composer-wrap${open ? ' is-open' : ''}`} inert={!open}>
      <div className="composer-clip">{formEl}</div>
    </div>
  );
}
