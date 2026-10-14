import { ArrowLeft } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../components/PageStates';
import { TasksPage } from '../tasks/TasksPage';
import type { ProjectRef } from '../types';

/** One project's tasks, by date. Reached from the Go button on the projects home. */
export function ProjectPage() {
  const { projectId } = useParams();
  // The Go button passes the project along, so the page can render at once.
  const passed = (useLocation().state as { project?: ProjectRef } | null)?.project;
  const [projects, setProjects] = useState<ProjectRef[] | null>(passed && passed.id === projectId ? [passed] : null);

  useEffect(() => {
    if (passed?.id === projectId) return;
    api
      .listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [projectId]);

  if (projects === null) return <main className="page"><p className="panel-note">Loading project…</p></main>;

  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <main className="page">
        <Link className="back-link" to="/projects">
          <ArrowLeft size={14} weight="bold" aria-hidden="true" />
          All projects
        </Link>
        <EmptyState title="This project isn't available.">
          <p>It may have been archived. Pick another project from the list.</p>
        </EmptyState>
      </main>
    );
  }

  // Keyed so switching projects starts with fresh filters and an empty panel.
  return <TasksPage key={project.id} project={project} />;
}
