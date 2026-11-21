'use client';

import type { ReactNode } from 'react';
import { Fact, HINTS, crore, websiteHref } from '@/components/company/Overview';
import { Tr } from '@/components/Tr';
import { fmt } from '@/components/format';

type Row = [label: string, key: string, show?: (v: unknown) => ReactNode, hint?: string];

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// DSE sends these amounts in ৳ mn; shown in crore (÷10) like every other amount on the page.
const mnToCr = (v: unknown) => { const n = num(v); return n == null ? '—' : (n < 0 ? '−' : '') + '৳' + fmt(Math.abs(n) / 10, 1) + ' cr'; };
const pct = (v: unknown) => (num(v) == null ? '—' : fmt(num(v)) + '%');
const yesNo = (v: unknown) => (v === 'Y' ? 'Yes' : v === 'N' ? 'No' : text(v));
const link = (v: unknown) => { const href = websiteHref(typeof v === 'string' ? v : null); return href ? <a href={href} target="_blank" rel="noopener noreferrer">{String(v)} ↗</a> : text(v); };
const rating = (v: unknown) => (v == null || (typeof v === 'string' && !v.trim()) ? 'Not rated' : text(v));
// Raw-table amounts get the app's usual digit grouping; identifiers elsewhere stay ungrouped.
const grouped = (v: unknown) => (typeof v === 'number' && Math.abs(v) >= 1e4 ? Number(v.toPrecision(12)).toLocaleString('en-IN', { maximumFractionDigits: 6 }) : text(v));
// No ?, & or other mailto: header characters, so an address cannot prefill cc / body.
const EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

// Each comma-separated number becomes a tel: link; the href keeps a leading + and then digits only.
function phones(v: unknown): ReactNode {
  if (typeof v !== 'string' || !v.trim()) return text(v);
  const parts = v.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  return parts.map((p, i) => {
    const raw = p.split(/\b(?:ext|x)\b/i)[0].replace(/[^\d+]/g, ''), tel = (raw.startsWith('+') ? '+' : '') + raw.replace(/\D/g, '');
    return <span key={i}>{i ? ', ' : ''}{tel.replace('+', '').length >= 5 ? <a href={'tel:' + tel}>{p}</a> : p}</span>;
  });
}

function emails(v: unknown): ReactNode {
  if (typeof v !== 'string' || !v.trim()) return text(v);
  return v.split(/[,;\s]+/).filter(Boolean).map((e, i) => <span key={i}>{i ? ', ' : ''}{EMAIL.test(e) ? <a href={'mailto:' + e}>{e}</a> : e}</span>);
}

function text(v: unknown): string {
  if (v == null || v === '') return '—';
  // Drop float noise such as -1.8999999999999773; the value itself is unchanged.
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12)));
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${x == null || x === '' ? '—' : typeof x === 'object' ? JSON.stringify(x) : text(x)}`).join('; ') || '—';
  return String(v);
}

const GROUPS: [string, Row[]][] = [
  ['Contact', [['Head office', 'hq'], ['Registered office', 'registeredOffice'], ['Factory', 'factoryAddress'], ['Phone', 'phone', phones], ['Fax', 'fax'], ['Email', 'email', emails]]],
  ['Links', [['Price-sensitive information', 'psiUrl', link], ['Financial statements', 'financialStatementsUrl', link]]],
  ['Identifiers', [['ISIN', 'isin', undefined, 'ISIN: the international code that identifies this share. It is the same at every broker.'],
    ['Scrip code', 'scripCode', undefined, 'Scrip code: the number DSE gives this share in its own systems.'], ['Instrument type', 'instrumentType'], ['Board', 'board'], ['Market lot (shares)', 'marketLot'],
    ['Electronic share', 'electronicShare', yesNo], ['OTC status', 'otcStatus'], ['Credit rating', 'creditRating', rating]]],
  ['Capital & float', [['Authorized capital (৳ cr)', 'authorizedCapital', mnToCr], ['Free float', 'freeFloat', pct, HINTS.freeFloat], ['Free-float market cap', 'freeFloatMarketCap', (v) => crore(num(v), 1), HINTS.freeFloatCap],
    ['Reserve (without OCI) (৳ cr)', 'reserveWithoutOci', mnToCr, 'Reserve: profit the company kept over the years instead of paying it out.'],
    ['Other comprehensive income (OCI) (৳ cr)', 'otherComprehensiveIncome', mnToCr, 'OCI: gains or losses not yet realised, for example a change in the value of investments. It is not part of normal profit.']]],
];
const SECRETARY: [string, string, ((v: unknown) => ReactNode)?][] = [['Name', 'name'], ['Email', 'email', emails], ['Phone', 'phone', phones], ['Mobile', 'cell', phones]];
// sessionQuote is shown in Today's trading on the Overview tab.
const SHOWN = new Set([...GROUPS.flatMap(([, rows]) => rows.map(([, k]) => k)), 'companySecretary', 'description', 'sessionQuote']);

export function Details({ details }: { details: Record<string, unknown> | undefined }) {
  const d = details ?? {};
  const sec = (d.companySecretary && typeof d.companySecretary === 'object' ? d.companySecretary : {}) as Record<string, unknown>;
  const rest = Object.keys(d).filter((k) => !SHOWN.has(k));
  const group = ([title, rows]: [string, Row[]], i: number) => (
    <div key={title} className="panel" style={i || typeof d.description === 'string' ? { marginTop: 14 } : undefined}><h3><Tr text={title} /></h3>
      <div className="facts">{rows.map(([label, k, show, hint]) => <Fact key={k} label={label} hint={hint}>{show ? show(d[k]) : text(d[k])}</Fact>)}</div></div>
  );
  return (
    <>
      {GROUPS.slice(0, 2).map((g, i) => group(g, i))}
      {typeof d.description === 'string' && d.description.trim() ? <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="About the company" /></h3><p>{d.description}</p></div> : null}
      {GROUPS.slice(2).map((g) => group(g, 1))}
      <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="Company secretary" /></h3>
        <div className="facts">{SECRETARY.map(([label, k, show]) => <Fact key={k} label={label}>{show ? show(sec[k]) : text(sec[k])}</Fact>)}</div></div>
      {rest.length ? (
        <div className="panel" style={{ marginTop: 14 }}>
          <details><summary className="toggle-btn"><Tr text="Advanced: raw DSE fields" /> ({rest.length})</summary>
            <div className="table-wrap"><table><thead><tr><th>Field</th><th>Value</th></tr></thead>
              <tbody>{rest.map((k) => <tr key={k}><td className="mono">{k}</td><td className="mono">{grouped(d[k])}</td></tr>)}</tbody></table></div>
            <p className="why"><Tr text="Field names and values as DSE sends them, for checking. Everything useful is shown above in plain words." /></p></details></div>) : null}
    </>
  );
}
