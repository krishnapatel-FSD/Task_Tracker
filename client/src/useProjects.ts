import { useEffect, useState } from 'react';
import { api } from './api';
import type { ProjectRef } from './types';

/** Active projects for selects, filters and chips. */
export function useProjects() {
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);
  return projects;
}
