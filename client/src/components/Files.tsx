import { DownloadSimple, File as FileIcon, Trash, UploadSimple } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { api, ApiError, downloadAttachment, uploadAttachment } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatBytes, formatDateTime, timeAgo } from '../format';
import type { Attachment } from '../types';

const MAX_MB = 10;
const MAX_FILES = 10;
const ALLOWED = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'csv', 'docx', 'xlsx', 'pptx', 'zip'];

interface Upload {
  key: number;
  name: string;
  progress: number;
  error?: string;
}

/** Files on a task. The server re-checks every rule; these checks just save a round trip. */
/** `canEdit`: the admin or the assignee. Everyone else on the team can only read and download. */
export function Files({ taskId, canEdit, onCountChange }: { taskId: string; canEdit: boolean; onCountChange: (count: number) => void }) {
  const { user } = useAuth();
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  const load = useCallback(async () => {
    try {
      const list = await api.listAttachments(taskId);
      setFiles(list);
      onCountChange(list.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't load the files.");
    }
  }, [taskId, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const updateUpload = (key: number, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  async function uploadAll(selected: File[]) {
    setError(null);
    let room = MAX_FILES - (files?.length ?? 0);
    for (const file of selected) {
      const key = ++nextKey.current;
      setUploads((list) => [...list, { key, name: file.name, progress: 0 }]);
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED.includes(ext)) {
        updateUpload(key, { error: `That file type isn't allowed. Use ${ALLOWED.join(', ')}.` });
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        updateUpload(key, { error: `Files can be up to ${MAX_MB} MB.` });
        continue;
      }
      if (room <= 0) {
        updateUpload(key, { error: `A task can have up to ${MAX_FILES} files.` });
        continue;
      }
      try {
        await uploadAttachment(taskId, file, (progress) => updateUpload(key, { progress }));
        room--;
        setUploads((list) => list.filter((u) => u.key !== key));
        await load();
      } catch (err) {
        updateUpload(key, { error: err instanceof ApiError ? err.message : 'Upload failed.' });
      }
    }
  }

  async function remove(file: Attachment) {
    setError(null);
    try {
      await api.deleteAttachment(file.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't remove that file.");
    }
  }

  async function download(file: Attachment) {
    setError(null);
    try {
      await downloadAttachment(file);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't download that file.");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    uploadAll([...e.dataTransfer.files]);
  }

  return (
    <div className="files">
      {canEdit && (
        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <UploadSimple size={18} weight="bold" aria-hidden="true" />
          <span>Drop files here or</span>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => inputRef.current?.click()}>
            Choose files
          </button>
          <span className="dropzone-hint">
            PDF, images, Office, text or zip. Up to {MAX_MB} MB each, {MAX_FILES} per task.
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept={ALLOWED.map((e) => `.${e}`).join(',')}
            onChange={(e) => {
              uploadAll([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="upload-list">
          {uploads.map((u) => (
            <li key={u.key} className={u.error ? 'has-error' : undefined}>
              <span className="upload-name">{u.name}</span>
              {u.error ? (
                <>
                  <span className="field-error">{u.error}</span>
                  <button type="button" className="btn btn-link" onClick={() => setUploads((l) => l.filter((x) => x.key !== u.key))}>
                    Dismiss
                  </button>
                </>
              ) : (
                <progress value={u.progress} max={1} aria-label={`Uploading ${u.name}`} />
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="panel-note panel-error">{error}</p>}

      {files === null ? (
        <p className="panel-note">Loading files…</p>
      ) : files.length === 0 ? (
        <p className="panel-note">No files yet.</p>
      ) : (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.id}>
              <FileIcon size={18} aria-hidden="true" className="file-icon" />
              <button type="button" className="file-name" onClick={() => download(f)} title={`Download ${f.fileName}`}>
                {f.fileName}
              </button>
              <span className="file-meta">
                {formatBytes(f.sizeBytes)}, {f.uploader.id === user?.id ? 'you' : f.uploader.name},{' '}
                <time dateTime={f.createdAt} title={formatDateTime(f.createdAt)}>
                  {timeAgo(f.createdAt)}
                </time>
              </span>
              <span className="file-actions">
                <button type="button" className="icon-button" onClick={() => download(f)} aria-label={`Download ${f.fileName}`}>
                  <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                </button>
                {canEdit && (user?.role === 'admin' || f.uploader.id === user?.id) && (
                  <button type="button" className="icon-button icon-danger" onClick={() => remove(f)} aria-label={`Remove ${f.fileName}`}>
                    <Trash size={16} weight="bold" aria-hidden="true" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
