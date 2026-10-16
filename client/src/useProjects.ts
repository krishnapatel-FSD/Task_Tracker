import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { ProjectRef } from './types';
import { useLiveRefresh } from './live';

/** Active projects for selects, filters and chips. */
export function useProjects() {
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const load = useCallback(() => {
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);
  useEffect(load, [load]);
  // New, renamed or archived projects reach every open dropdown.
  useLiveRefresh(load, (c) => c.scope === 'projects');
  return projects;
}
