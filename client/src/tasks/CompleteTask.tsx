import { CheckCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CompletionNote, Task } from '../types';

interface Props {
  task: Task;
  busy: boolean;
  onSubmit: (note: CompletionNote) => void;
  onCancel: () => void;
}

/**
 * Marking a task done asks for a short note: what was done and how long it took.
 * The admin and the person the task is assigned to can both read it later.
 */
export function CompleteTask({ task, busy, onSubmit, onCancel }: Props) {
  const [summary, setSummary] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [errors, setErrors] = useState<{ summary?: string; time?: string }>({});
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    summaryRef.current?.focus({ preventScroll: true });
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const h = hours.trim() === '' ? 0 : Number(hours);
    const m = minutes.trim() === '' ? 0 : Number(minutes);
    const found: typeof errors = {};
    if (summary.trim().length < 3) found.summary = 'Write a short summary of what you did.';
    else if (summary.trim().length > 2000) found.summary = 'Keep the summary to 2000 characters or fewer.';
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) found.time = 'Enter whole hours, and minutes from 0 to 59.';
    else if (h * 60 + m < 1) found.time = 'Enter how long it took.';
    setErrors(found);
    if (found.summary) return summaryRef.current?.focus();
    if (found.time) return document.getElementById(`complete-${task.id}-hours`)?.focus();
    onSubmit({ summary: summary.trim(), minutesSpent: h * 60 + m });
  }

  return (
    <form className="complete-form" onSubmit={handleSubmit} noValidate>
      <div className="complete-head">
        <h2 className="complete-title">Mark as done</h2>
        <p className="complete-task">{task.title}</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`complete-${task.id}-summary`}>
          What did you do?
        </label>
        <textarea
          id={`complete-${task.id}-summary`}
          ref={summaryRef}
          rows={5}
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value);
            if (errors.summary) setErrors((x) => ({ ...x, summary: undefined }));
          }}
          aria-invalid={errors.summary ? 'true' : undefined}
          aria-describedby={`complete-${task.id}-summary-hint`}
          placeholder="For example: sent the invoices to finance and filed the receipts."
        />
        {errors.summary ? (
          <p className="field-error" id={`complete-${task.id}-summary-hint`}>
            {errors.summary}
          </p>
        ) : (
          <p className="field-hint" id={`complete-${task.id}-summary-hint`}>
            The admin and {task.assignee.name} can read this note.
          </p>
        )}
      </div>

      <fieldset className="field complete-time">
        <legend className="field-label">How long did it take?</legend>
        <div className="time-inputs">
          <label className="time-input">
            <input
              id={`complete-${task.id}-hours`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={hours}
              onChange={(e) => {
                setHours(e.target.value);
                if (errors.time) setErrors((x) => ({ ...x, time: undefined }));
              }}
              aria-invalid={errors.time ? 'true' : undefined}
            />
            <span>hours</span>
          </label>
          <label className="time-input">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              step={1}
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value);
                if (errors.time) setErrors((x) => ({ ...x, time: undefined }));
              }}
              aria-invalid={errors.time ? 'true' : undefined}
            />
            <span>minutes</span>
          </label>
        </div>
        {errors.time && <p className="field-error">{errors.time}</p>}
      </fieldset>

      <div className="complete-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          <CheckCircle size={18} weight="bold" aria-hidden="true" />
          {busy ? 'Saving…' : 'Mark as done'}
        </button>
        <button type="button" className="btn btn-quiet btn-lg" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
