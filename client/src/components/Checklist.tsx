import { Plus, X } from '@phosphor-icons/react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import type { ChecklistItem } from '../types';

/**
 * Steps inside a task. The admin and the assignee tick, add and remove them; everyone
 * else sees the list and who ticked what.
 */
export function Checklist({
  taskId,
  canEdit,
  onCountChange,
}: {
  taskId: string;
  canEdit: boolean;
  onCountChange: (total: number, done: number) => void;
}) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const list = await api.listChecklist(taskId);
      setItems(list);
      onCountChange(list.length, list.filter((i) => i.done).length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't load the checklist.");
    }
  };

  useEffect(() => {
    setItems(null);
    setError(null);
    load();
  }, [taskId]);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't save that. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    await run('new', () => api.addChecklistItem(taskId, value));
    setText('');
  }

  if (!items) return null;
  // Nothing to show to people who can't add steps.
  if (items.length === 0 && !canEdit) return null;

  const done = items.filter((i) => i.done).length;

  return (
    <section className="panel-section checklist" aria-labelledby={`checklist-${taskId}`}>
      <div className="checklist-head">
        <h3 id={`checklist-${taskId}`}>Checklist</h3>
        {items.length > 0 && (
          <span className="checklist-progress">
            {done} of {items.length} done
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="project-progress-bar checklist-bar" aria-hidden="true">
          <span style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
        </div>
      )}
      <ul className="checklist-items">
        {items.map((item) => (
          <li key={item.id} className={item.done ? 'is-done' : undefined}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                disabled={!canEdit || busyId === item.id}
                onChange={() => run(item.id, () => api.updateChecklistItem(item.id, { done: !item.done }))}
              />
              <span className="checklist-text">{item.text}</span>
            </label>
            {item.done && item.doneBy && <span className="checklist-by">{item.doneBy.name}</span>}
            {canEdit && (
              <button
                type="button"
                className="icon-button checklist-remove"
                aria-label={`Remove "${item.text}"`}
                disabled={busyId === item.id}
                onClick={() => run(item.id, () => api.deleteChecklistItem(item.id))}
              >
                <X size={14} weight="bold" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className="checklist-add" onSubmit={add}>
          <input
            value={text}
            maxLength={200}
            placeholder="Add a step"
            aria-label="New checklist step"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn btn-quiet btn-small" disabled={busyId === 'new' || !text.trim()}>
            <Plus size={14} weight="bold" aria-hidden="true" />
            Add
          </button>
        </form>
      )}
      {error && <p className="field-error">{error}</p>}
    </section>
  );
}
