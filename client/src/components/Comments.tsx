import { PaperPlaneRight } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatDateTime, timeAgo } from '../format';
import type { CommentRevision, Employee, Person, TaskComment } from '../types';
import { useToast } from './Toast';

const UNDO_MS = 8000;

// The team rarely changes during a session: load it once for every comment box.
let peopleCache: Promise<Person[]> | null = null;
function usePeople() {
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => {
    peopleCache ??= api.listPeople().catch(() => {
      peopleCache = null;
      return [];
    });
    peopleCache.then(setPeople);
  }, []);
  return people;
}

/** The conversation on a task, oldest first, with a box to add to it. Separate from completion notes. */
export function Comments({ taskId, onCountChange }: { taskId: string; onCountChange: (count: number) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const people = usePeople();
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () =>
    api
      .listComments(taskId)
      .then((list) => {
        setComments(list);
        onCountChange(list.filter((c) => !c.deleted).length);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "We couldn't load the comments."));

  useEffect(() => {
    setComments(null);
    setError(null);
    load();
  }, [taskId]);

  async function remove(c: TaskComment) {
    try {
      await api.deleteComment(c.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't delete that comment.");
      return;
    }
    await load();
    toast({
      message: 'Comment deleted.',
      durationMs: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await api.restoreComment(c.id);
            await load();
          } catch {
            toast({ message: "We couldn't bring that comment back." });
          }
        },
      },
    });
  }

  if (error && !comments) return <p className="panel-note panel-error">{error}</p>;
  if (!comments) return <p className="panel-note">Loading comments…</p>;

  return (
    <div className="comments">
      {comments.length === 0 ? (
        <p className="panel-note">No comments yet. Ask a question or share an update; type @ to mention someone.</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) =>
            c.deleted ? (
              <li key={c.id} className="comment is-deleted">
                <p className="comment-deleted">Comment deleted.</p>
              </li>
            ) : (
              <li key={c.id} className="comment">
                <div className="comment-head">
                  <span className="comment-avatar" aria-hidden="true">
                    {initials(c.author.name)}
                  </span>
                  <span className="comment-author">{c.author.id === user?.id ? 'You' : c.author.name}</span>
                  <time className="comment-time" dateTime={c.createdAt} title={formatDateTime(c.createdAt)}>
                    {timeAgo(c.createdAt)}
                  </time>
                  {c.editedAt && (
                    <EditedMark comment={c} canSeeHistory={user?.role === 'admin' || c.author.id === user?.id} />
                  )}
                </div>
                {editingId === c.id ? (
                  <MentionBox
                    people={people}
                    selfId={user?.id}
                    initial={c.body ?? ''}
                    initialMentions={c.mentions}
                    submitLabel="Save"
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (body, ids) => {
                      await api.editComment(c.id, body, ids);
                      setEditingId(null);
                      await load();
                    }}
                  />
                ) : (
                  <p className="comment-body">{renderBody(c.body ?? '', c.mentions, user?.id)}</p>
                )}
                {editingId !== c.id && (c.author.id === user?.id || user?.role === 'admin') && (
                  <div className="comment-actions">
                    {c.author.id === user?.id && (
                      <button type="button" className="btn btn-link" onClick={() => setEditingId(c.id)}>
                        Edit
                      </button>
                    )}
                    <button type="button" className="btn btn-link comment-delete" onClick={() => remove(c)}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {error && <p className="panel-note panel-error">{error}</p>}

      <MentionBox
        key={`new-${comments.length}`}
        people={people}
        selfId={user?.id}
        submitLabel="Comment"
        placeholder="Write a comment. Type @ to mention someone."
        onSubmit={async (body, ids) => {
          await api.addComment(taskId, body, ids);
          await load();
        }}
      />
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Mentioned names stand out; a mention of you stands out a little more. */
function renderBody(body: string, mentions: Employee[], selfId: string | undefined): ReactNode[] {
  if (mentions.length === 0) return [body];
  const escaped = mentions.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
  const parts = body.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'));
  return parts.map((part, i) => {
    const m = part.startsWith('@') ? mentions.find((x) => `@${x.name}` === part) : undefined;
    return m ? (
      <span key={i} className={`mention${m.id === selfId ? ' is-you' : ''}`}>
        {part}
      </span>
    ) : (
      part
    );
  });
}

/** "edited": the author and the admin can open the earlier versions. */
function EditedMark({ comment, canSeeHistory }: { comment: TaskComment; canSeeHistory: boolean }) {
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<CommentRevision[] | null>(null);
  if (!canSeeHistory) {
    return (
      <span className="comment-edited" title={comment.editedAt ? `Edited ${formatDateTime(comment.editedAt)}` : undefined}>
        edited
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className="comment-edited is-button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!revisions) api.listCommentRevisions(comment.id).then(setRevisions).catch(() => setRevisions([]));
        }}
      >
        edited{comment.revisionCount > 0 ? ` (${comment.revisionCount})` : ''}
      </button>
      {open && (
        <div className="comment-history">
          <p className="comment-history-title">Earlier versions</p>
          {!revisions ? (
            <p className="panel-note">Loading…</p>
          ) : (
            <ol>
              {revisions.map((r) => (
                <li key={r.id}>
                  <span className="comment-history-when">Before {formatDateTime(r.createdAt)}</span>
                  <span className="comment-history-body">{r.body}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  );
}

interface BoxProps {
  people: Person[];
  selfId: string | undefined;
  initial?: string;
  initialMentions?: Employee[];
  submitLabel: string;
  placeholder?: string;
  onSubmit: (body: string, mentionIds: string[]) => Promise<void>;
  onCancel?: () => void;
}

/** A comment box. Typing @ opens a list of people; picking one inserts "@Name". */
function MentionBox({ people, selfId, initial = '', initialMentions = [], submitLabel, placeholder, onSubmit, onCancel }: BoxProps) {
  const [text, setText] = useState(initial);
  const [picked, setPicked] = useState<Employee[]>(initialMentions);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();

  const matches =
    query === null
      ? []
      : people
          .filter((p) => p.id !== selfId && p.name.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => Number(!a.name.toLowerCase().startsWith(query.toLowerCase())) - Number(!b.name.toLowerCase().startsWith(query.toLowerCase())))
          .slice(0, 6);

  /** Finds an @word being typed just before the cursor. */
  function updateQuery(value: string, caret: number) {
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setQuery(m ? m[2] : null);
    setActive(0);
  }

  function choose(p: Person) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${p.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setPicked((list) => (list.some((x) => x.id === p.id) ? list : [...list, { id: p.id, name: p.name }]));
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  }

  async function submit() {
    const body = text.trim();
    if (!body) {
      setError('Write a comment first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body, picked.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id));
      setText('');
      setPicked([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't save that comment. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (matches.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(matches[active]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape' && onCancel) onCancel();
  }

  return (
    <div className="mention-box">
      <div className="mention-field">
        <textarea
          ref={ref}
          rows={3}
          value={text}
          placeholder={placeholder}
          aria-label={submitLabel === 'Save' ? 'Edit comment' : 'New comment'}
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={matches.length > 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            updateQuery(e.target.value, e.target.selectionStart);
            if (error) setError(null);
          }}
          onClick={(e) => updateQuery(e.currentTarget.value, e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setQuery(null), 150)}
        />
        {matches.length > 0 && (
          <ul className="mention-list" id={listId} role="listbox" aria-label="People">
            {matches.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'is-active' : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
              >
                <span className="comment-avatar" aria-hidden="true">
                  {initials(p.name)}
                </span>
                {p.name}
                {p.role === 'admin' && <span className="mention-role">Admin</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="mention-actions">
        <span className="mention-hint">Ctrl + Enter to send</span>
        {onCancel && (
          <button type="button" className="btn btn-quiet btn-small" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="button" className="btn btn-primary btn-small" onClick={submit} disabled={busy}>
          {submitLabel === 'Comment' && <PaperPlaneRight size={14} weight="bold" aria-hidden="true" />}
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
