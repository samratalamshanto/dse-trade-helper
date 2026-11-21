import type { ReactNode } from 'react';
import { Tr } from '@/components/Tr';
import { SIGNAL_TEXT } from '@/lib/glossary';

const SHIELD = 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';

const PATHS = {
  check: ['M20 6 9 17l-5-5'],
  cross: ['M18 6 6 18M6 6l12 12'],
  research: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'm9 12 2 2 4-4'],
  neutral: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M8 12h8'],
  caution: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4M12 17h.01'],
  avoid: ['M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z', 'm15 9-6 6M9 9l6 6'],
  clean: [SHIELD, 'm9 12 2 2 4-4'],
  suspicious: [SHIELD, 'M12 8v4M12 16h.01'],
  high: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  trend: ['M22 7 13.5 15.5 8.5 10.5 2 17', 'M16 7h6v6'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  home: ['m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  star: ['M11.5 3.2a.6.6 0 0 1 1 0l2.3 4.7 5.2.8a.6.6 0 0 1 .3 1l-3.8 3.6.9 5.2a.6.6 0 0 1-.8.6L12 16.7l-4.6 2.4a.6.6 0 0 1-.8-.6l.9-5.2-3.8-3.6a.6.6 0 0 1 .3-1l5.2-.8z'],
  list: ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
  calendar: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M16 2v4M8 2v4M3 10h18'],
  help: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
  panelClose: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 3v18', 'm16 15-3-3 3-3'],
  panelOpen: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 3v18', 'm13 9 3 3-3 3'],
  info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 8v.01M12 11v5'],
  grid: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
  columns: ['M4 4h4v16H4zM10 4h4v16h-4zM16 4h4v16h-4z'],
  wallet: ['M3 7a2 2 0 0 1 2-2h13v4', 'M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z', 'M16 14h.01'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  tag: ['M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z', 'M7.5 7.5h.01'],
  coins: ['M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12z', 'M18.09 10.37A6 6 0 1 1 10.34 18', 'M7 6h1v4', 'm16.71 13.88.7.71-2.82 2.82'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm17 8-5-5-5 5', 'M12 3v12'],
  target: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z', 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'],
  search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'm21 21-4.3-4.3'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z'],
  globe: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
} as const;

export type IconName = keyof typeof PATHS;

// Decorative icon: the text next to it carries the meaning, so screen readers skip it.
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={`ic ${className}`} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

export const SIGNALS = SIGNAL_TEXT;
export type Signal = keyof typeof SIGNALS;

export const FRAUD = { clean: 'Clean', suspicious: 'Suspicious', high: 'High risk' } as const;
export type FraudLevel = keyof typeof FRAUD;

export const SIGNAL_ORDER: Record<Signal, number> = { avoid: 0, caution: 1, neutral: 2, research: 3 };

export function SignalPill({ signal, big = false }: { signal: Signal; big?: boolean }) {
  return <span className={`pill s-${signal}`} style={big ? { fontSize: 16 } : undefined}><Icon name={signal} /> <Tr text={SIGNALS[signal].label} /></span>;
}

export function FraudPill({ level, big = false }: { level: FraudLevel; big?: boolean }) {
  return <span className={`pill f-${level}`} style={big ? { fontSize: 16 } : undefined}><Icon name={level} /> <Tr text={FRAUD[level]} /></span>;
}

// Grey rows in the shape of the content, so a page never looks empty or jumps while its data loads.
export function Skeleton({ label = 'Loading…', rows = 6 }: { label?: string; rows?: number }) {
  return (
    <div className="panel skel-block" role="status" aria-busy="true">
      <span className="sr-only"><Tr text={label} /></span>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel skel-line" />)}
    </div>
  );
}

// Small "i" that shows a plain-language explanation on hover or keyboard focus.
export function Info({ text }: { text: string }) {
  return <span className="info" tabIndex={0} role="note" aria-label={text} data-tip={text}>i</span>;
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return <div className="metric"><div className="k"><Tr text={label} /> <Info text={hint} /></div><div className="v mono">{value}</div></div>;
}
