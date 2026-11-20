'use client';

import { useMemo } from 'react';
import { useApi } from '@/components/AppProvider';
import { useStoredValue } from '@/components/useStored';
import { parseLots, aggregateLots, type Lot } from '@/lib/portfolio';
import type { CompanyRow, CalendarRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';
import { LotForm } from '@/components/portfolio/LotForm';
import { HoldingsTable } from '@/components/portfolio/HoldingsTable';
import { AllocationChart } from '@/components/portfolio/AllocationChart';
import { IncomeSection } from '@/components/portfolio/IncomeSection';
import { WhatIfCalc } from '@/components/portfolio/WhatIfCalc';
import { CsvPanel } from '@/components/portfolio/CsvPanel';
import { Icon } from '@/components/ui';
import { useLang } from '@/components/i18n';

interface Companies { rows: CompanyRow[]; session: MarketSession | null }
interface Dividends { upcoming: CalendarRow[]; recent: CalendarRow[]; expected: CalendarRow[]; session: MarketSession | null }

function allDividends(d: Dividends | null): CalendarRow[] {
  if (!d) return [];
  return [...(d.upcoming ?? []), ...(d.recent ?? []), ...(d.expected ?? [])];
}

export default function PortfolioPage() {
  const { t } = useLang();
  const [raw, setRaw] = useStoredValue('portfolio', '[]');
  const lots = useMemo(() => parseLots(raw), [raw]);

  const { data: compData, error: compError } = useApi<Companies>('/api/companies');
  const { data: divData } = useApi<Dividends>('/api/dividends');

  const companies = useMemo(() => compData?.rows ?? [], [compData]);
  const compByCode = useMemo(() => Object.fromEntries(companies.map((c) => [c.code, c])), [companies]);
  const liveMap = useMemo(() => Object.fromEntries(companies.map((c) => [c.code, { price: c.price, changePct: c.changePct ?? null }])), [companies]);

  const holdings = useMemo(() => aggregateLots(lots, liveMap), [lots, liveMap]);
  const dividends = useMemo(() => allDividends(divData), [divData]);
  const totalCost = useMemo(() => holdings.reduce((s, h) => s + h.cost, 0), [holdings]);

  function addLot(lot: Lot) {
    setRaw((cur) => JSON.stringify([...parseLots(cur), lot]));
  }
  function editLot(index: number, lot: Lot) {
    setRaw((cur) => { const arr = parseLots(cur); arr[index] = lot; return JSON.stringify(arr); });
  }
  function removeLot(index: number) {
    setRaw((cur) => { const arr = parseLots(cur); arr.splice(index, 1); return JSON.stringify(arr); });
  }
  function importLots(imported: Lot[], replace: boolean) {
    setRaw((cur) => JSON.stringify(replace ? imported : [...parseLots(cur), ...imported]));
  }

  return (
    <>
      <h1>{t('Portfolio')}</h1>
      <p className="muted">{t('Your holdings, stored in this browser only. They do not sync to other devices.')}</p>

      {compError && !compData && <div className="note bad">{t('Could not load live prices')}: {compError}. {t('Your holdings are safe — try Refresh.')}</div>}

      {!lots.length ? (
        <div className="panel empty-state" style={{ marginBottom: 16 }}>
          <Icon name="wallet" />
          <p><b>{t('Your portfolio is empty.')}</b></p>
          <p className="muted">{t('Add your first holding below. Data stays in this browser only.')}</p>
        </div>
      ) : (
        <>
          <HoldingsTable holdings={holdings} companies={compByCode} allLots={lots} onEdit={editLot} onRemove={removeLot} />
          <div className="panel" style={{ marginTop: 14, marginBottom: 16 }}>
            <h2 className="h3">{t('Allocation')}</h2>
            <AllocationChart holdings={holdings} />
          </div>
        </>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 className="h3">{t('Add a holding')}</h2>
        <LotForm companies={companies} onSave={addLot} />
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 className="h3">{t('Import / Export CSV')}</h2>
        <CsvPanel lots={lots} knownCodes={companies.length > 0 ? companies.map((c) => c.code) : undefined} onImport={importLots} />
      </div>

      {lots.length > 0 && (
        <>
          <IncomeSection lots={lots} dividends={dividends} totalCost={totalCost} />
          <div className="panel" style={{ marginTop: 14 }}>
            <WhatIfCalc companies={companies} dividends={dividends} />
          </div>
        </>
      )}

      <p className="why" style={{ marginTop: 20 }}>{t('Prices refresh every minute while the market is open. All data stays in this browser.')}</p>
    </>
  );
}
