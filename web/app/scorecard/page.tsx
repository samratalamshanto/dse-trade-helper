'use client';

import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { useApi } from '@/components/AppProvider';
import { Skeleton } from '@/components/ui';
import { fmt, fmtDateLang, signed, tone } from '@/components/format';
import { GRADED_SIGNALS, HORIZONS, scorecardTooEarly, weakestGroup, type Grade, type Scorecard } from '@/lib/scorecard';

type Report = Scorecard & { note: string; session?: null };

// Below this many graded calls a percentage moves a lot with each new call.
const SMALL_SAMPLE = 30;
// Until this many trading days of snapshots exist the % right figures and best/worst calls are hidden.
const LABEL: Record<string, string> = { research: 'Passes the checks', caution: 'Caution', avoid: 'High risk' };
const RIGHT_WHEN: Record<string, string> = { research: 'right when it beat DSEX', caution: 'right when it lagged DSEX', avoid: 'right when it lagged DSEX' };

function CallList({ title, list }: { title: string; list: Grade[] }) {
  const { t, lang } = useLang();
  const days = (h: number) => `${h} ${t(h === 1 ? 'trading day' : 'trading days')}`;
  return (
    <div className="panel">
      <h2><Tr text={title} /></h2>
      {list.length ? <ul className="today-list">{list.map((g) => (
        <li key={g.code + g.date} className="check">
          <Link className="mono" href={'/c/' + encodeURIComponent(g.code)}><b>{g.code}</b></Link>
          <span className={'pill s-' + g.signal}>{t(LABEL[g.signal])}</span>
          <span className="small muted">{fmtDateLang(g.date, lang)}, after {days(g.horizon)}:</span>
          <span className="mono">{signed(g.excess)} vs DSEX</span>
          <span className="small muted">{t(g.right ? '✓ right' : '✗ wrong')}</span>
        </li>))}</ul> : <p className="muted small"><Tr text="None yet." /></p>}
    </div>
  );
}

export default function ScorecardPage() {
  const { data: d, error } = useApi<Report>('/api/scorecard');
  const { t, lang } = useLang();
  const days = (h: number) => `${h} ${t(h === 1 ? 'trading day' : 'trading days')}`;
  if (error && !d) return <div className="note bad">Could not load the scorecard: {error}</div>;
  if (!d) return <Skeleton label="Loading scorecard" />;
  const weak = weakestGroup(d.bySignal);
  const graded = GRADED_SIGNALS.some((s) => HORIZONS.some((h) => d.bySignal[s][h].n > 0));
  const tooEarly = scorecardTooEarly(d.days);

  return (
    <>
      <h1><Tr text="Signal scorecard" /></h1>
      <div className="note">
        <Tr text="Every trading day after the close we save what this app said about each company." />{' '}
        <Tr text="Later we grade each call against the DSEX index at 1, 5 and 20 trading days." /> <b><Tr text="Passes the checks" /></b>{' '}
        <Tr text="is right when the share beat DSEX;" />{' '}
        <b><Tr text="Caution" /></b> <Tr text="and" /> <b><Tr text="High risk" /></b>{' '}
        <Tr text="are right when it lagged DSEX." />{' '}
        <Tr text="Neutral is not graded. The first grades appear after 1 trading day; the full picture needs 20. This is our track record, not a forecast. Learning aid, not investment advice." />
      </div>
      <p className="small muted">{d.days ? <>{t('Snapshots since')} {fmtDateLang(d.since, lang)}: {d.days === 1 ? t(`${d.days} trading day.`) : t(`${d.days} trading days.`)} </> : null}{t('Waiting to be graded:')} {t(`${d.pending} call checks.`)}</p>

      {!graded ? (
        <div className="panel empty-state">
          <h2><Tr text="No grades yet" /></h2>
          <p className="muted">{d.days ? 'The first snapshot is saved. Grades appear after the next trading day closes.' : 'The first snapshot is taken after the next market close (14:45 Dhaka time, Sunday to Thursday).'}</p>
        </div>
      ) : (
        <>
          {tooEarly ? (
            <div className="note">
              <b><Tr text="Too early:" /></b> {d.days} <Tr text="of 20 trading days so far" />. <Tr text="Percentages and best/worst calls appear after 20 trading days." />
            </div>
          ) : weak ? (
            <div className="note warn"><b>{t('Weak spot:')}</b> {t(LABEL[weak.signal])} {t('calls after')} {days(weak.horizon)} {t('were right')} {fmt(weak.group.pctRight, 0)}% {t('of the time')}
              ({weak.group.right} of {weak.group.n}). {t('Treat that signal with extra care.')}</div>
          ) : null}
          <div className="grid g3">{GRADED_SIGNALS.map((s) => (
            <section key={s} className="panel" aria-labelledby={'sc-' + s}>
              <h2 id={'sc-' + s} style={{ marginTop: 0 }}><span className={'pill s-' + s}>{t(LABEL[s])}</span></h2>
              <p className="small muted">{t(RIGHT_WHEN[s])}</p>
              <table>
                <thead><tr><th><Tr text="After" /></th>{!tooEarly ? <th className="n"><Tr text="Right" /></th> : null}<th className="n"><Tr text="Avg vs DSEX" /></th><th className="n"><Tr text="Calls" /></th></tr></thead>
                <tbody>{HORIZONS.map((h) => {
                  const g = d.bySignal[s][h];
                  // Same rule as the old colour: a call is right when its average beat (research) or lagged (caution, high risk) DSEX.
                  const right = tone(g.avgExcess == null ? null : g.avgExcess * (s === 'research' ? 1 : -1));
                  return (
                    <tr key={h}>
                      <td>{days(h)}</td>
                      {!tooEarly ? <td className="n mono">{g.pctRight == null ? '—' : fmt(g.pctRight, 0) + '%'}</td> : null}
                      <td className="n mono">{signed(g.avgExcess)}{right ? <> <span className="small muted">{t(right === 'up' ? '✓ right' : '✗ wrong')}</span></> : null}</td>
                      <td className="n mono">{g.n}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              {!tooEarly && HORIZONS.some((h) => d.bySignal[s][h].n > 0 && d.bySignal[s][h].n < SMALL_SAMPLE)
                ? <p className="small muted"><Tr text="Some rows have fewer than " />{SMALL_SAMPLE}<Tr text=" graded calls: those percentages can still change a lot." /></p> : null}
            </section>
          ))}</div>
          {!tooEarly ? (
            <>
              <p className="small muted"><Tr text="The 5 calls that best and worst matched the market, by excess return at their longest graded horizon." /></p>
              <div className="grid g2 quick">
                <CallList title="Best calls" list={d.best} />
                <CallList title="Worst calls" list={d.worst} />
              </div>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
