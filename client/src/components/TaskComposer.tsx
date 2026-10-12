import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { PRIORITIES, PRIORITY_LABELS, type Employee, type Priority, type Task } from '../types';

interface Props {
  open: boolean;
  employees: Employee[];
  onCreated: (task: Task) => void;
  onClose: () => void;
}

type Field = 'title' | 'description' | 'assigneeId' | 'priority' | 'deadline';
type FormState = Record<Field, string>;

const emptyForm: FormState = { title: '', description: '', assigneeId: '', priority: '', deadline: '' };

function validate(form: FormState) {
  const errors: Partial<Record<Field, string>> = {};
  if (!form.title.trim()) errors.title = 'Give the task a title.';
  else if (form.title.trim().length > 150) errors.title = 'Keep the title to 150 characters or fewer.';
  if (!form.assigneeId) errors.assigneeId = 'Choose who this task is for.';
  if (!form.priority) errors.priority = 'Choose a priority.';
  if (!form.deadline) errors.deadline = 'Choose a deadline.';
  if (!form.description.trim()) errors.description = 'Describe what needs to be done.';
  return errors;
}

/** Inline panel that opens above the list, so the admin never loses sight of it. */
export function TaskComposer({ open, employees, onCreated, onClose }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // Focusing inside the collapsed clip would scroll it; wait for the open transition.
      const timer = window.setTimeout(() => {
        titleRef.current?.focus({ preventScroll: true });
        if (clipRef.current) clipRef.current.scrollTop = 0;
      }, 250);
      return () => window.clearTimeout(timer);
    } else {
      setForm(emptyForm);
      setErrors({});
      setServerError(null);
    }
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
      document.getElementById(`composer-${Object.keys(found)[0]}`)?.focus();
      return;
    }

    setSubmitting(true);
    setServerError(null);
    try {
      const task = await api.createTask({
        title: form.title.trim(),
        description: form.description.trim(),
        assigneeId: form.assigneeId,
        priority: form.priority as Priority,
        deadline: form.deadline,
      });
      onCreated(task);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "We couldn't create the task. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const describedBy = (field: Field) => (errors[field] ? `composer-${field}-error` : undefined);
  const fieldError = (field: Field) =>
    errors[field] && (
      <span id={`composer-${field}-error`} className="field-error">
        {errors[field]}
      </span>
    );

  return (
    <div className={`composer-wrap${open ? ' is-open' : ''}`} inert={!open}>
      <div className="composer-clip" ref={clipRef}>
        <form
          className="composer"
          onSubmit={handleSubmit}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          noValidate
          aria-labelledby="composer-heading"
        >
          <h2 id="composer-heading" className="composer-heading">
            New task
          </h2>

          <div className="composer-grid">
            <label className="field field-title">
              <span className="field-label">Title</span>
              <input
                id="composer-title"
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
              <span className="field-label">Assignee</span>
              <select
                id="composer-assigneeId"
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
              <div className="segmented" id="composer-priority" tabIndex={-1}>
                {PRIORITIES.map((p) => (
                  <label key={p} className="segment">
                    <input
                      type="radio"
                      name="priority"
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
                id="composer-deadline"
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
                id="composer-description"
                rows={3}
                value={form.description}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={describedBy('description')}
                onChange={(e) => set('description', e.target.value)}
              />
              {fieldError('description')}
            </label>
          </div>

          {serverError && (
            <p className="banner banner-error" role="alert">
              {serverError}
            </p>
          )}

          <div className="composer-actions">
            <span className="composer-hint">New tasks start as To do.</span>
            <button type="button" className="btn btn-quiet" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
