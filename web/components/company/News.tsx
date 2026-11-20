import { fmtDate } from '@/components/format';
import { Tr } from '@/components/Tr';
import { Icon, type IconName } from '@/components/ui';
import { toIso } from '@/lib/announcements';
import type { NewsItem } from '@/lib/types';

interface Kind { label: string; icon: IconName; important: boolean }

// Plain-language kind for each DSE notice; routine trading notices are shown but dimmed.
function kindOf(n: NewsItem): Kind {
  const s = n.summary;
  if (/(buy|sell)\s+(declaration|confirmation)/i.test(s)) return { label: 'Director trade', icon: 'high', important: true };
  if (n.type === 'Dividend') return { label: 'Dividend', icon: 'calendar', important: true };
  if (n.type === 'Financials') return { label: 'Results', icon: 'trend', important: true };
  if (n.type === 'Rating') return { label: 'Credit rating', icon: 'star', important: true };
  if (/record date|spot|price limit|resumption|suspension/i.test(s)) return { label: 'Trading notice', icon: 'info', important: false };
  return { label: 'Notice', icon: 'file', important: true };
}

export function News({ news, code }: { news: NewsItem[] | undefined; code: string }) {
  if (!news?.length) return <p className="muted">No recent news on DSE for this company. Press Refresh to load it if this page was saved before news was added.</p>;
  return (
    <div className="panel">
      <h3><Tr text="Latest DSE announcements" /></h3>
      <ul className="news">
        {news.map((n, i) => {
          const k = kindOf(n);
          const long = n.body.length > 220;
          return (
            <li key={`${n.date}-${i}`} className={k.important ? '' : 'routine'}>
              <div className="news-head"><span className="pill s-neutral"><Icon name={k.icon} /> {k.label}</span>
                <span className="small muted mono">{fmtDate(toIso(n.date))}</span></div>
              <b>{n.summary}</b>
              {long ? (
                <details><summary className="small"><Tr text="Read more" /></summary><p className="small">{n.body}</p></details>
              ) : <p className="small">{n.body}</p>}
            </li>
          );
        })}
      </ul>
      <p className="why">Source: DSE company news. <a href={'https://www.dse.com.bd/company/' + encodeURIComponent(code)} target="_blank" rel="noopener noreferrer">All news on DSE ↗</a></p>
    </div>
  );
}
