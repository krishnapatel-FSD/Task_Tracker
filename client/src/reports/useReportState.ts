import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { reportsApi, ApiError, type ReportParams } from '../api';

export type RangePreset = 'this-week' | 'last-week' | '30d' | 'quarter' | 'custom';
export type ReportTab = 'overview' | 'projects' | 'employees' | 'weekly';

export const PRESET_LABELS: Record<Exclude<RangePreset, 'custom'>, string> = {
  'this-week': 'This week',
  'last-week': 'Last week',
  '30d': 'Last 30 days',
  quarter: 'This quarter',
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function presetRange(preset: Exclude<RangePreset, 'custom'>, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  switch (preset) {
    case 'this-week':
      return { from: iso(monday), to: iso(addDays(monday, 6)) };
    case 'last-week':
      return { from: iso(addDays(monday, -7)), to: iso(addDays(monday, -1)) };
    case '30d':
      return { from: iso(addDays(today, -29)), to: iso(today) };
    case 'quarter':
      return { from: iso(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)), to: iso(today) };
  }
}

/**
 * All report state lives in the URL (tab, range, filters, focused item),
 * so any view can be bookmarked or shared.
 */
export function useReportState() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as ReportTab) || 'overview';
  const preset = (params.get('range') as RangePreset) || '30d';
  const projectId = params.get('projectId') ?? '';
  const assigneeId = params.get('assigneeId') ?? '';
  const focus = params.get('focus') ?? '';

  const { from, to } =
    preset === 'custom'
      ? { from: params.get('from') ?? presetRange('30d').from, to: params.get('to') ?? presetRange('30d').to }
      : presetRange(preset);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      setParams(next, { replace: false });
    },
    [params, setParams],
  );

  const filters: ReportParams = useMemo(
    () => ({ from, to, projectId: projectId || undefined, assigneeId: assigneeId || undefined }),
    [from, to, projectId, assigneeId],
  );

  return { tab, preset, from, to, projectId, assigneeId, focus, filters, update };
}

/**
 * Loads one report endpoint. While refetching it keeps the previous data
 * (dimmed by the caller) instead of flashing a skeleton.
 */
export function useReport<T>(path: string, params: ReportParams & Record<string, string | undefined>, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify([path, params]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    reportsApi
      .get<T>(path, params)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "We couldn't load this report."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return { data, loading, error };
}
