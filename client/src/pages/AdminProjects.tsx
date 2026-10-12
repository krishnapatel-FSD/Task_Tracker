import { Plus } from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { EmptyState, ErrorBanner } from '../components/PageStates';
import type { Project } from '../types';

export function AdminProjects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .listAllProjects()
      .then(setProjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : "We couldn't load projects."));
  }, []);

  useEffect(load, [load]);

  const active = projects?.filter((p) => !p.archivedAt) ?? [];
  const archived = projects?.filter((p) => p.archivedAt) ?? [];

  return (
    <main className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="page-summary">
            {projects ? `${active.length} active${archived.length ? `, ${archived.length} archived` : ''}` : 'Loading projects…'}
          </p>
        </div>
        {!creating && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            New project
          </button>
        )}
      </div>

      {creating && (
        <ProjectForm
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      {error && <ErrorBanner message={error} onRetry={load} />}

      {projects && projects.length === 0 && (
        <EmptyState title="No projects yet.">
          <p>Every task belongs to a project. Create one to start assigning work.</p>
        </EmptyState>
      )}

      {active.length > 0 && <ProjectList projects={active} onChanged={load} />}

      {archived.length > 0 && (
        <section className="projects-archived" aria-labelledby="archived-heading">
          <h2 id="archived-heading" className="tt-group-title">
            Archived <span className="tt-group-count">{archived.length}</span>
          </h2>
          <ProjectList projects={archived} onChanged={load} />
        </section>
      )}
    </main>
  );
}

function ProjectList({ projects, onChanged }: { projects: Project[]; onChanged: () => void }) {
  return (
    <ul className="project-list">
      {projects.map((p) => (
        <ProjectRow key={p.id} project={p} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function ProjectRow({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleArchive() {
    setBusy(true);
    setError(null);
    try {
      await api.updateProject(project.id, { archived: !project.archivedAt });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't update the project.");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="project-row is-editing">
        <ProjectForm
          project={project}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <li className={`project-row${project.archivedAt ? ' is-archived' : ''}`}>
      <span className={`project-swatch project-swatch-lg line-${project.colourIndex % 8}`} aria-hidden="true" />
      <div className="project-main">
        <span className="project-name">{project.name}</span>
        {project.description && <span className="project-desc">{project.description}</span>}
        {error && <span className="field-error">{error}</span>}
      </div>
      <span className="project-counts">
        <strong>{project.openTasks}</strong> open
        <span className="project-total">of {project.totalTasks}</span>
      </span>
      <div className="project-actions">
        {!project.archivedAt && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setEditing(true)}>
            Rename
          </button>
        )}
        <button type="button" className="btn btn-link" onClick={toggleArchive} disabled={busy}>
          {project.archivedAt ? 'Restore' : 'Archive'}
        </button>
      </div>
    </li>
  );
}

function ProjectForm({ project, onCancel, onSaved }: { project?: Project; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the project a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (project) {
        await api.updateProject(project.id, { name: name.trim(), description: description.trim() || null });
      } else {
        await api.createProject({ name: name.trim(), ...(description.trim() && { description: description.trim() }) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't save the project.");
      setSaving(false);
    }
  }

  return (
    <form className="project-form" onSubmit={handleSubmit} onKeyDown={(e) => e.key === 'Escape' && onCancel()} noValidate>
      <label className="field">
        <span className="field-label">Name</span>
        <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus aria-invalid={Boolean(error)} />
      </label>
      <label className="field">
        <span className="field-label">Description (optional)</span>
        <input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </label>
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
          {saving ? 'Saving…' : project ? 'Save' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
