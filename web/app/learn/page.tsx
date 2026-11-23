import { FraudPill, Icon, SIGNALS, type Signal } from '@/components/ui';
import { Tr } from '@/components/Tr';
import { FLAGS, TERMS } from '@/lib/glossary';

// Words from the Company details and Financials tabs.
const COMPANY_TERMS: [string, string][] = [
  ['Free float', 'The share of all shares that ordinary investors can trade. Sponsor and government shares are not counted. A small free float means few shares change hands, so the price can jump.'],
  ['ISIN', 'International Securities Identification Number: a 12-character code that identifies one share, for example BD0001GP0004. It is the same at every broker.'],
  ['OCI (other comprehensive income)', 'Gains or losses the company has not yet realised, for example a change in the value of its investments. It is reported apart from normal profit.'],
  ['CAGR (growth a year)', 'Compound annual growth rate: the steady yearly rate that takes the first year to the latest year. +10% a year over 5 years means the figure grew about 61% in total.'],
  ['Restated EPS', 'EPS that the company corrected after it first published it, for example after a bonus share issue. Restated figures make the years comparable.'],
];

export default function LearnPage() {
  return (
    <>
      <h1><Tr text="How it works" /></h1>
      <p className="muted"><Tr text="Every signal comes from fixed rules on public DSE data. No human opinion is added; the rules can still be wrong or miss news. Each reason on a company page shows the number behind it, so you can check it." /></p>
      <div className="grid g2">
        <div className="panel" id="signals"><h2 className="h3"><Tr text="The four signals" /></h2><ul className="reasons">
          {(Object.keys(SIGNALS) as Signal[]).map((k) => <li key={k}><Icon name={k} /><span><b><Tr text={SIGNALS[k].label} /></b><div className="why"><Tr text={SIGNALS[k].text} /></div></span></li>)}
        </ul></div>
        <div className="panel" id="fraud-check"><h2 className="h3"><Tr text="The warning-sign check" /></h2><ul className="reasons">
          {FLAGS.map(([t, d]) => <li key={t}><Icon name="caution" /><span><b><Tr text={t} /></b><div className="why"><Tr text={d} /></div></span></li>)}
        </ul>
          <p className="why"><Tr text="Any flag gives" /> <FraudPill level="suspicious" />. <FraudPill level="high" /> <Tr text="needs category Z, or a price pump or loss-making rise confirmed by a flag of another kind (for example owners selling or old financials). A flag is a pattern, not proof." /></p></div>
      </div>
      <div className="panel" id="words" style={{ marginTop: 14 }}><h2 className="h3"><Tr text="Words you will see" /></h2>
        <dl className="gloss">{[...TERMS, ...COMPANY_TERMS].map(([t, d]) => <div key={t}><dt><Tr text={t} /></dt><dd><Tr text={d} /></dd></div>)}</dl></div>
      <div className="note warn"><Tr text="These rules do not see news, auditor opinions or bank loan quality. Use the signal to choose what to research, then read the company's disclosures before you trade." /></div>
    </>
  );
}
