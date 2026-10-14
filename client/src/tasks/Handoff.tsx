import { ArrowsLeftRight, CheckCircle, Paperclip, Warning } from '@phosphor-icons/react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, downloadFile } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatDateTime } from '../format';
import type { Employee, Handoff, Task } from '../types';

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Write a handoff: who takes the task over, what's done, what's left, what's in the way,
 * what was decided and which files matter. Pre-filled from the task's checklist, comments and files.
 */
export function HandoffForm({
  task,
  employees,
  onCancel,
  onDone,
}: {
  task: Task;
  employees: Employee[];
  onCancel: () => void;
  onDone: (task: Task) => void;
}) {
  const [toUserId, setToUserId] = useState('');
  const [done, setDone] = useState('');
  const [remaining, setRemaining] = useState('');
  const [blockers, setBlockers] = useState('');
  const [decisions, setDecisions] = useState('');
  const [files, setFiles] = useState<{ id: string; fileName: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getHandoffDraft(task.id)
      .then((d) => {
        setDone(d.done.join('\n'));
        setRemaining(d.remaining.join('\n'));
        setDecisions(d.decisions);
        setFiles(d.files);
        setPicked(new Set(d.files.map((f) => f.id)));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "We couldn't prepare the handoff."))
      .finally(() => setLoading(false));
  }, [task.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!toUserId) {
      setError('Pick who takes the task over.');
      return;
    }
    if (!remaining.trim() && !blockers.trim()) {
      setError('Say what is left to do, or what is blocking it, so the next person knows where to start.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.createHandoff(task.id, {
        toUserId,
        done: lines(done),
        remaining: lines(remaining),
        blockers: blockers.trim(),
        decisions: decisions.trim(),
        attachmentIds: [...picked],
      });
      onDone(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't hand the task off. Try again.");
      setSaving(false);
    }
  }

  const people = employees.filter((e) => e.id !== task.assignee.id);

  return (
    <form className="complete-form handoff-form" onSubmit={submit} noValidate>
      <div className="complete-head">
        <h2 className="complete-title">Hand off</h2>
        <p className="complete-task">
          {task.title} · now with {task.assignee.name}
        </p>
      </div>

      <label className="field">
        <span className="field-label">Hand it to</span>
        <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} autoFocus>
          <option value="">Choose a person</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <p className="panel-note">Preparing the summary from the checklist, comments and files…</p>
      ) : (
        <>
          <p className="field-hint">We filled this in from the checklist, recent comments and files. Edit anything; one point per line.</p>
          <label className="field">
            <span className="field-label">Done so far</span>
            <textarea rows={3} value={done} onChange={(e) => setDone(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Still to do</span>
            <textarea rows={3} value={remaining} onChange={(e) => setRemaining(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Blockers (optional)</span>
            <textarea rows={2} value={blockers} placeholder="Waiting on the March statement from the bank." onChange={(e) => setBlockers(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Decisions and context</span>
            <textarea rows={3} value={decisions} onChange={(e) => setDecisions(e.target.value)} />
          </label>
          {files.length > 0 && (
            <fieldset className="field handoff-files">
              <legend className="field-label">Files to point out</legend>
              {files.map((f) => (
                <label key={f.id} className="calendar-check">
                  <input
                    type="checkbox"
                    checked={picked.has(f.id)}
                    onChange={() =>
                      setPicked((s) => {
                        const next = new Set(s);
                        if (next.has(f.id)) next.delete(f.id);
                        else next.add(f.id);
                        return next;
                      })
                    }
                  />
                  {f.fileName}
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}

      <p className="field-hint">The task moves to them now, and stays locked until they accept it.</p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="complete-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={saving || loading}>
          <ArrowsLeftRight size={18} weight="bold" aria-hidden="true" />
          {saving ? 'Handing off…' : 'Hand off'}
        </button>
        <button type="button" className="btn btn-quiet btn-lg" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Summary({ h }: { h: Handoff }) {
  return (
    <div className="handoff-summary">
      {h.done.length > 0 && (
        <div>
          <p className="handoff-label">Done so far</p>
          <ul>
            {h.done.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {h.remaining.length > 0 && (
        <div>
          <p className="handoff-label">Still to do</p>
          <ul>
            {h.remaining.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {h.blockers && (
        <div className="handoff-blockers">
          <p className="handoff-label">
            <Warning size={13} weight="bold" aria-hidden="true" /> Blockers
          </p>
          <p>{h.blockers}</p>
        </div>
      )}
      {h.decisions && (
        <div>
          <p className="handoff-label">Decisions and context</p>
          <p className="handoff-text">{h.decisions}</p>
        </div>
      )}
      {h.files.length > 0 && (
        <div>
          <p className="handoff-label">Files</p>
          <ul className="handoff-file-list">
            {h.files.map((f) => (
              <li key={f.id}>
                <Paperclip size={13} weight="bold" aria-hidden="true" />
                {f.removed ? (
                  <span className="handoff-removed">{f.fileName} (removed)</span>
                ) : (
                  <button type="button" className="btn btn-link" onClick={() => downloadFile(`/attachments/${f.id}/download`, f.fileName)}>
                    {f.fileName}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The latest handoff on a task. The person receiving it sees the summary and an Accept button;
 * everyone else sees who it's waiting on, or who accepted it.
 */
export function HandoffCard({ task, onAccepted }: { task: Task; onAccepted: (task: Task) => void }) {
  const { user } = useAuth();
  const [handoffs, setHandoffs] = useState<Handoff[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listHandoffs(task.id).then(setHandoffs).catch(() => setHandoffs([]));
  }, [task.id, task.handoffPending, task.assignee.id]);

  const latest = handoffs?.[0];
  if (!latest) return null;
  const pending = !latest.acceptedAt;
  const forMe = pending && latest.to.id === user?.id;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      onAccepted(await api.acceptHandoff(task.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't accept it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`handoff-card${forMe ? ' is-for-me' : ''}${pending ? ' is-pending' : ''}`} aria-label="Handoff">
      <div className="handoff-head">
        <ArrowsLeftRight size={16} weight="bold" aria-hidden="true" />
        <p>
          {forMe ? (
            <>
              <b>{latest.by.id === latest.from.id ? latest.from.name : latest.by.name}</b> handed this task to you
              {latest.by.id !== latest.from.id && <> from {latest.from.name}</>}.
            </>
          ) : pending ? (
            <>
              Waiting for <b>{latest.to.name}</b> to accept this handoff from {latest.from.name}.
            </>
          ) : (
            <>
              Handed from {latest.from.name} to <b>{latest.to.name}</b>, accepted {formatDateTime(latest.acceptedAt!)}.
            </>
          )}
        </p>
      </div>

      {forMe || open ? <Summary h={latest} /> : null}

      {forMe ? (
        <>
          <p className="field-hint">Read it through, ask anything in Comments, then accept to take the task on. Until then it stays locked.</p>
          {error && <p className="field-error">{error}</p>}
          <button type="button" className="btn btn-primary btn-lg handoff-accept" onClick={accept} disabled={busy}>
            <CheckCircle size={18} weight="bold" aria-hidden="true" />
            {busy ? 'Accepting…' : 'Accept and take it on'}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-link handoff-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide the handoff' : 'Read the handoff'}
        </button>
      )}
    </section>
  );
}
