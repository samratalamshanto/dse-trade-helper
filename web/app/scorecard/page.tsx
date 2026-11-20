'use client';

import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { useApi } from '@/components/AppProvider';
import { fmt, fmtDate, signed, tone } from '@/components/format';
import { GRADED_SIGNALS, HORIZONS, weakestGroup, type Grade, type Scorecard } from '@/lib/scorecard';

type Report = Scorecard & { note: string; session?: null };

// Below this many graded calls a percentage moves a lot with each new call.
const SMALL_SAMPLE = 30;
const LABEL: Record<string, string> = { research: 'Research', caution: 'Caution', avoid: 'Avoid' };
const RIGHT_WHEN: Record<string, string> = { research: 'right when it beat DSEX', caution: 'right when it lagged DSEX', avoid: 'right when it lagged DSEX' };
// Colours follow the call, not the number: green when the result backed the signal, red when it went against it.
const days = (h: number) => `${h} trading day${h === 1 ? '' : 's'}`;

function CallList({ title, list }: { title: string; list: Grade[] }) {
  return (
    <div className="panel">
      <h2><Tr text={title} /></h2>
      {list.length ? <ul className="today-list">{list.map((g) => (
        <li key={g.code + g.date} className="check">
          <Link className="mono" href={'/c/' + encodeURIComponent(g.code)}><b>{g.code}</b></Link>
          <span className={'pill s-' + g.signal}>{LABEL[g.signal]}</span>
          <span className="small muted">{fmtDate(g.date)}, after {days(g.horizon)}:</span>
          <span className={'mono ' + (g.right ? 'up' : 'down')}>{signed(g.excess)} vs DSEX</span>
        </li>))}</ul> : <p className="muted small">None yet.</p>}
    </div>
  );
}

export default function ScorecardPage() {
  const { data: d, error } = useApi<Report>('/api/scorecard');
  if (error && !d) return <div className="note bad">Could not load the scorecard: {error}</div>;
  if (!d) return <div className="empty">Loading…</div>;
  const weak = weakestGroup(d.bySignal);
  const graded = GRADED_SIGNALS.some((s) => HORIZONS.some((h) => d.bySignal[s][h].n > 0));

  return (
    <>
      <h1><Tr text="How our signals did" /></h1>
      <div className="note">Every trading day after the close we save what this app said about each company. Later we grade each call against the
        DSEX index at <b>1, 5 and 20 trading days</b>. <b>Research</b> is right when the share beat DSEX; <b>caution</b> and <b>avoid</b> are right when it lagged DSEX.
        Neutral is not graded. The first grades appear after 1 trading day; the full picture needs 20. This is our track record, not a forecast. Learning aid, not investment advice.</div>
      <p className="small muted">{d.days ? <>Snapshots since {fmtDate(d.since)}: {d.days} trading day{d.days === 1 ? '' : 's'}. </> : null}Waiting to be graded: {d.pending} call checks.</p>

      {!graded ? (
        <div className="panel empty-state">
          <h2><Tr text="No grades yet" /></h2>
          <p className="muted">{d.days ? 'The first snapshot is saved. Grades appear after the next trading day closes.' : 'The first snapshot is taken after the next market close (14:45 Dhaka time, Sunday to Thursday).'}</p>
        </div>
      ) : (
        <>
          {weak ? <div className="note warn"><b>Weak spot:</b> {LABEL[weak.signal]} calls after {days(weak.horizon)} were right {fmt(weak.group.pctRight, 0)}% of the time
            ({weak.group.right} of {weak.group.n}). Treat that signal with extra care.</div> : null}
          <div className="grid g3">{GRADED_SIGNALS.map((s) => (
            <section key={s} className="panel" aria-labelledby={'sc-' + s}>
              <h2 id={'sc-' + s}><span className={'pill s-' + s}>{LABEL[s]}</span></h2>
              <p className="small muted">{RIGHT_WHEN[s]}</p>
              <table>
                <thead><tr><th>After</th><th className="n">Right</th><th className="n">Avg vs DSEX</th><th className="n">Calls</th></tr></thead>
                <tbody>{HORIZONS.map((h) => {
                  const g = d.bySignal[s][h];
                  return (
                    <tr key={h}>
                      <td>{days(h)}</td>
                      <td className="n mono">{g.pctRight == null ? '—' : fmt(g.pctRight, 0) + '%'}</td>
                      <td className={'n mono ' + tone(g.avgExcess == null ? null : g.avgExcess * (s === 'research' ? 1 : -1))}>{signed(g.avgExcess)}</td>
                      <td className="n mono">{g.n}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              {HORIZONS.some((h) => d.bySignal[s][h].n > 0 && d.bySignal[s][h].n < SMALL_SAMPLE)
                ? <p className="small muted">Some rows have fewer than {SMALL_SAMPLE} graded calls: those percentages can still change a lot.</p> : null}
            </section>
          ))}</div>
          <div className="grid g2 quick">
            <CallList title="Best calls" list={d.best} />
            <CallList title="Worst calls" list={d.worst} />
          </div>
        </>
      )}
    </>
  );
}
