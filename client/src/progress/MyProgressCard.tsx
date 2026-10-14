import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PersonProgress } from '../types';
import { MonthPicker, ProgressLegend, ProgressRow, useMonth } from './ProgressRow';

/** "Your progress" on My tasks: this month's tasks as blocks. Employees only ever see their own. */
export function MyProgressCard({ refreshKey, onOpenTask }: { refreshKey: string; onOpenTask: (taskId: string) => void }) {
  const month = useMonth();
  const [me, setMe] = useState<PersonProgress | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .getProgress({ from: month.from, to: month.to })
      .then((r) => {
        setMe(r.people[0] ?? null);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [month.from, month.to, refreshKey]);

  if (failed || !me) return null;

  return (
    <section className="my-progress" aria-labelledby="my-progress-h">
      <div className="my-progress-head">
        <h2 id="my-progress-h">Your progress</h2>
        <MonthPicker label={month.label} isCurrent={month.isCurrent} step={month.step} />
      </div>
      <ul className="progress-list is-single">
        <ProgressRow person={me} title={month.isCurrent ? 'This month' : month.label} expanded onOpenTask={onOpenTask} />
      </ul>
      <ProgressLegend />
    </section>
  );
}
