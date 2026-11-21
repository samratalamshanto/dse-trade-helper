'use client';

import type { ReactNode } from 'react';
import { Fact, crore, websiteHref } from '@/components/company/Overview';
import { Tr } from '@/components/Tr';
import { fmt } from '@/components/format';

type Row = [label: string, key: string, show?: (v: unknown) => ReactNode];

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const mn = (v: unknown) => { const n = num(v); return n == null ? '—' : (n < 0 ? '−' : '') + '৳' + fmt(Math.abs(n)) + ' mn'; };
const pct = (v: unknown) => (num(v) == null ? '—' : fmt(num(v)) + '%');
const yesNo = (v: unknown) => (v === 'Y' ? 'Yes' : v === 'N' ? 'No' : text(v));
const link = (v: unknown) => { const href = websiteHref(typeof v === 'string' ? v : null); return href ? <a href={href} target="_blank" rel="noopener noreferrer">{String(v)} ↗</a> : text(v); };

function text(v: unknown): string {
  if (v == null || v === '') return '—';
  // Drop float noise such as -1.8999999999999773; the value itself is unchanged.
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12)));
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${x == null || x === '' ? '—' : typeof x === 'object' ? JSON.stringify(x) : String(x)}`).join('; ') || '—';
  return String(v);
}

const GROUPS: [string, Row[]][] = [
  ['Identifiers', [['ISIN', 'isin'], ['Scrip code', 'scripCode'], ['Instrument type', 'instrumentType'], ['Board', 'board'], ['Market lot (shares)', 'marketLot'], ['Electronic share', 'electronicShare', yesNo], ['OTC status', 'otcStatus'], ['Credit rating', 'creditRating']]],
  ['Capital & float', [['Authorized capital', 'authorizedCapital', mn], ['Free float', 'freeFloat', pct], ['Free-float market cap', 'freeFloatMarketCap', (v) => crore(num(v), 1)], ['Reserve (without OCI)', 'reserveWithoutOci', mn], ['Other comprehensive income', 'otherComprehensiveIncome', mn]]],
  ['Contact', [['Head office', 'hq'], ['Registered office', 'registeredOffice'], ['Factory', 'factoryAddress'], ['Phone', 'phone'], ['Fax', 'fax'], ['Email', 'email']]],
  ['Links', [['Price-sensitive information', 'psiUrl', link], ['Financial statements', 'financialStatementsUrl', link]]],
];
const SECRETARY: [string, string][] = [['Name', 'name'], ['Email', 'email'], ['Phone', 'phone'], ['Mobile', 'cell']];
// sessionQuote is shown in Today's trading on the Overview tab.
const SHOWN = new Set([...GROUPS.flatMap(([, rows]) => rows.map(([, k]) => k)), 'companySecretary', 'description', 'sessionQuote']);

export function Details({ details }: { details: Record<string, unknown> | undefined }) {
  const d = details ?? {};
  const sec = (d.companySecretary && typeof d.companySecretary === 'object' ? d.companySecretary : {}) as Record<string, unknown>;
  const rest = Object.keys(d).filter((k) => !SHOWN.has(k));
  return (
    <>
      {typeof d.description === 'string' && d.description.trim() ? <div className="panel"><h3><Tr text="About the company" /></h3><p>{d.description}</p></div> : null}
      {GROUPS.map(([title, rows]) => (
        <div key={title} className="panel" style={{ marginTop: 14 }}><h3><Tr text={title} /></h3>
          <div className="facts">{rows.map(([label, k, show]) => <Fact key={k} label={label}>{show ? show(d[k]) : text(d[k])}</Fact>)}</div></div>
      ))}
      <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="Company secretary" /></h3>
        <div className="facts">{SECRETARY.map(([label, k]) => <Fact key={k} label={label}>{text(sec[k])}</Fact>)}</div></div>
      {rest.length ? (
        <div className="panel table-wrap" style={{ marginTop: 14 }}><h3><Tr text="Other fields from DSE" /></h3>
          <table><thead><tr><th>Field</th><th>Value</th></tr></thead>
            <tbody>{rest.map((k) => <tr key={k}><td className="mono">{k}</td><td className="mono">{text(d[k])}</td></tr>)}</tbody></table>
          <p className="why"><Tr text="Shown as DSE sends them, without changes." /></p></div>) : null}
    </>
  );
}
