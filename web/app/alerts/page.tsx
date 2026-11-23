'use client';

import { useMode } from '@/components/portfolio-store';
import { useState, useEffect, useSyncExternalStore } from 'react';
import { useApi } from '@/components/AppProvider';
import { useStoredValue } from '@/components/useStored';
import { useWatchlist } from '@/components/Watchlist';
import {
  parseAlertStore, encodeAlertStore, newRuleId,
  type AlertRule, type RuleType,
} from '@/lib/alerts';
import type { CompanyRow, CalendarRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';
import styles from './alerts.module.css';
import { CODE_RE } from '@/lib/dhaka';
import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';

interface Companies { rows: CompanyRow[]; session: MarketSession | null }
interface Calendar { upcoming: CalendarRow[]; session: MarketSession | null }

const RULE_LABELS: Record<RuleType, string> = {
  price_above: 'Price at or above',
  price_below: 'Price at or below',
  dividend: 'Dividend coming up',
  fraud_flag: 'New warning sign',
  big_move: 'Big move today',
};

const RULE_DESCS: Record<RuleType, string> = {
  price_above: 'Fires when the price reaches or exceeds your target.',
  price_below: 'Fires when the price drops to or below your target.',
  dividend: 'Fires N days before the last day to buy shares for a dividend payout.',
  fraud_flag: 'Fires when a new warning sign appears on the company since you set up this rule.',
  big_move: 'Fires when the price moves up or down by at least the threshold percentage in one day.',
};

// "now ৳226.70, 3.1% away" for price rules, so the user sees how close the target is.
function priceNow(rule: AlertRule, price: number | null | undefined): string | null {
  if (rule.type !== 'price_above' && rule.type !== 'price_below') return null;
  if (price == null || !(price > 0)) return 'no live price yet';
  const reached = rule.type === 'price_above' ? price >= rule.target : price <= rule.target;
  const away = (Math.abs(rule.target - price) / price) * 100;
  return `now ৳${price.toFixed(2)}, ${reached ? 'target reached' : `${away.toFixed(1)}% away`}`;
}

function ruleDesc(rule: AlertRule): string {
  switch (rule.type) {
    case 'price_above': return `${rule.code} price ≥ ৳${rule.target.toFixed(2)}`;
    case 'price_below': return `${rule.code} price ≤ ৳${rule.target.toFixed(2)}`;
    case 'dividend': return `${rule.code}: dividend within ${rule.daysBefore} day${rule.daysBefore !== 1 ? 's' : ''} of last buy`;
    case 'fraud_flag': return `${rule.code}: any new warning sign`;
    case 'big_move': return `${rule.code}: move ≥ ${rule.threshold}% in a day`;
  }
}

export default function AlertsPage() {
  const { t } = useLang();
  const { data } = useApi<Companies>('/api/companies');
  const { data: cal } = useApi<Calendar>('/api/dividends');
  const { codes: watchlistCodes } = useWatchlist();
  const [raw, setRaw] = useStoredValue('alerts', '{}');
  const tradesKey = useMode().mode === 'sheet';
  const store = parseAlertStore(raw);

  const [formType, setFormType] = useState<RuleType | ''>('');
  const [formCode, setFormCode] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formDays, setFormDays] = useState('3');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showSuggests, setShowSuggests] = useState(false);
  const [hiIdx, setHiIdx] = useState(-1);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('code');
    if (!p) return;
    const clean = p.trim().toUpperCase().slice(0, 12);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (/^[A-Z0-9&._-]+$/.test(clean)) setFormCode(clean);
  }, []);
  const [notifOverride, setNotifOverride] = useState<NotificationPermission | null>(null);
  const baseNotifPerm = useSyncExternalStore(
    () => () => {},
    () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission) as NotificationPermission | 'unsupported',
    () => 'unsupported' as NotificationPermission | 'unsupported',
  );
  const notifPerm = notifOverride ?? baseNotifPerm;

  const companies = data?.rows ?? [];
  const companyCodes = new Set(companies.map((c) => c.code));
  const upperCode = formCode.trim().toUpperCase();
  const lowerInput = formCode.trim().toLowerCase();
  const suggestions = (() => {
    if (formCode.trim().length < 1) return [];
    const exact = companies.filter((c) => c.code === upperCode);
    const starts = companies.filter((c) => c.code !== upperCode && c.code.startsWith(upperCode)).sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code)); // "G" → GP before GBBPOWER
    const codeContains = companies.filter((c) => !c.code.startsWith(upperCode) && c.code.includes(upperCode));
    const nameOnly = companies.filter((c) => !c.code.includes(upperCode) && c.name.toLowerCase().includes(lowerInput));
    return [...exact, ...starts, ...codeContains, ...nameOnly].slice(0, 8);
  })();

  const calByCode = Object.fromEntries((cal?.upcoming ?? []).map((r) => [r.code, r]));
  const priceByCode = Object.fromEntries(companies.map((c) => [c.code, c.price]));

  const handleToggle = (id: string) => {
    setRaw((cur) => {
      const s = parseAlertStore(cur);
      return encodeAlertStore({ ...s, rules: s.rules.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r) });
    });
  };

  const handleDelete = (id: string) => {
    setRaw((cur) => {
      const s = parseAlertStore(cur);
      return encodeAlertStore({ ...s, rules: s.rules.filter((r) => r.id !== id) });
    });
  };

  const handleAddDefaults = () => {
    const currentCompanies = data?.rows ?? [];
    setRaw((cur) => {
      const s = parseAlertStore(cur);
      const byCode = Object.fromEntries(currentCompanies.map((c) => [c.code, c]));
      const newRules: AlertRule[] = [];
      for (const code of watchlistCodes) {
        if (!s.rules.some((r) => r.type === 'dividend' && r.code === code)) {
          newRules.push({ type: 'dividend', id: newRuleId(), enabled: true, code, daysBefore: 3 });
        }
        if (!s.rules.some((r) => r.type === 'fraud_flag' && r.code === code)) {
          newRules.push({ type: 'fraud_flag', id: newRuleId(), enabled: true, code, seenFlags: byCode[code]?.flags ?? [] });
        }
      }
      if (!newRules.length) return cur;
      return encodeAlertStore({ ...s, rules: [...s.rules, ...newRules] });
    });
  };

  const handleRequestNotif = async () => {
    if (typeof Notification === 'undefined') return;
    try {
      const perm = await Notification.requestPermission();
      setNotifOverride(perm);
    } catch (err) {
      console.warn('alerts: notification permission request failed', err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!formType) { errs.type = 'Choose a rule type.'; }
    const codeVal = formCode.trim().toUpperCase();
    if (!codeVal) { errs.code = 'Enter a company code.'; }
    else if (!CODE_RE.test(codeVal)) { errs.code = 'Invalid code format.'; }
    else if (companyCodes.size > 0 && !companyCodes.has(codeVal)) { errs.code = 'Code not found in company list.'; }
    if (formType === 'fraud_flag' && !companies.length) { errs.code = 'Company data is still loading. Try again in a moment.'; }

    const needsTarget = formType === 'price_above' || formType === 'price_below';
    const needsThreshold = formType === 'big_move';
    if (needsTarget || needsThreshold) {
      const n = parseFloat(formTarget);
      if (!formTarget || isNaN(n) || n <= 0) { errs.target = 'Enter a positive number.'; }
    }

    if (formType === 'dividend') {
      const db = parseInt(formDays, 10);
      if (!formDays || isNaN(db) || db < 0 || db > 30) {
        errs.days = 'Enter a whole number between 0 and 30.';
      }
    }

    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    if (!formType) return;

    // Build rule here so we can check for duplicates before saving.
    const baseCode = codeVal;
    const id = newRuleId();
    let newRule: AlertRule;
    if (formType === 'price_above' || formType === 'price_below') {
      newRule = { type: formType, id, enabled: true, code: baseCode, target: parseFloat(formTarget) };
    } else if (formType === 'big_move') {
      newRule = { type: 'big_move', id, enabled: true, code: baseCode, threshold: parseFloat(formTarget) };
    } else if (formType === 'dividend') {
      newRule = { type: 'dividend', id, enabled: true, code: baseCode, daysBefore: parseInt(formDays, 10) };
    } else {
      const co = companies.find((c) => c.code === baseCode);
      newRule = { type: 'fraud_flag', id, enabled: true, code: baseCode, seenFlags: co?.flags ?? [] };
    }

    const isDup = store.rules.some((r) => {
      if (r.type !== newRule.type || r.code !== newRule.code) return false;
      if (r.type === 'price_above' && newRule.type === 'price_above') return r.target === newRule.target;
      if (r.type === 'price_below' && newRule.type === 'price_below') return r.target === newRule.target;
      if (r.type === 'big_move' && newRule.type === 'big_move') return r.threshold === newRule.threshold;
      if (r.type === 'dividend' && newRule.type === 'dividend') return r.daysBefore === newRule.daysBefore;
      return true;
    });
    if (isDup) { setFormErrors({ form: 'An identical rule already exists.' }); return; }

    setRaw((cur) => {
      const s = parseAlertStore(cur);
      return encodeAlertStore({ ...s, rules: [...s.rules, newRule] });
    });

    setFormType('');
    setFormCode('');
    setFormTarget('');
    setFormDays('3');
    setFormErrors({});
    setHiIdx(-1);
    setShowSuggests(false);
  };

  const needsTargetField = formType === 'price_above' || formType === 'price_below' || formType === 'big_move';
  const targetLabel = formType === 'big_move' ? 'Min % move' : 'Target price (৳)';

  return (
    <>
      <h1><Tr text="Alerts" /></h1>
      <p className="muted">Rules are checked only while a page of this site is open in this browser, and each rule fires at most once a day.
        Price and move rules use the current trading session only. {tradesKey ? 'Your rules are kept in your Google Sheet, so every device has them; what already fired stays per browser.' : 'All settings are saved in this browser only.'}</p>

      {/* Browser notifications */}
      <section>
        <h2><Tr text="Browser notifications" /></h2>
        <div className="panel">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {notifPerm === 'unsupported' && (
              <span className={`${styles.permBadge} ${styles.permOff}`}><Tr text="Not supported in this browser" /></span>
            )}
            {notifPerm === 'granted' && (
              <span className={`${styles.permBadge} ${styles.permOn}`}><Tr text="✓ Browser notifications are on" /></span>
            )}
            {notifPerm === 'denied' && (
              <span className={`${styles.permBadge} ${styles.permOff}`}><Tr text="Blocked: allow notifications for this site in your browser's site settings." /></span>
            )}
            {notifPerm === 'default' && (
              <>
                <span className={`${styles.permBadge} ${styles.permDefault}`}><Tr text="Not yet enabled" /></span>
                <button className="btn" type="button" onClick={() => void handleRequestNotif()}>
                  <Tr text="Turn on browser notifications" />
                </button>
              </>
            )}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            System notifications appear even when this tab is in the background.
            In-page toasts appear in the bottom-right corner regardless of permission.
          </p>
        </div>
      </section>

      {/* Rules list */}
      <section>
        <h2><Tr text="Your alert rules" /></h2>
        {watchlistCodes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button className="btn" type="button" onClick={handleAddDefaults} disabled={!companies.length}>
              Add default alerts for my watchlist ({watchlistCodes.length} companies)
            </button>
            <span className="small muted" style={{ marginLeft: 8 }}>
              Adds dividend + new warning sign rules for each watchlist company.
            </span>
          </div>
        )}
        <div className="panel">
          {!store.rules.length ? (
            <p className="muted" style={{ padding: '8px 0' }}>No rules yet. Add one below.</p>
          ) : (
            store.rules.map((rule) => (
              <div key={rule.id} className={styles.ruleRow}>
                <div className={styles.ruleDesc}>
                  <div><b>{ruleDesc(rule)}</b></div>
                  <div className="small muted">{RULE_LABELS[rule.type]}{data && priceNow(rule, priceByCode[rule.code]) ? ` · ${priceNow(rule, priceByCode[rule.code])}` : ''}</div>
                  {!calByCode[rule.code] && (rule.type === 'dividend') && (
                    <div className="small muted">No upcoming dividend announced for {rule.code}.</div>
                  )}
                </div>
                <div className={styles.ruleActions}>
                  <button
                    className={styles.toggle}
                    type="button"
                    aria-pressed={rule.enabled}
                    aria-label={`${rule.enabled ? 'Turn off' : 'Turn on'} rule ${ruleDesc(rule)}`}
                    onClick={() => handleToggle(rule.id)}
                  >
                    {rule.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    className={styles.del}
                    type="button"
                    aria-label={`Delete rule ${ruleDesc(rule)}`}
                    onClick={() => handleDelete(rule.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Add rule form */}
      <section>
        <h2><Tr text="Add a rule" /></h2>
        <div className="panel">
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.formRow}>
              {/* Type */}
              <div className={styles.fieldWrap}>
                <label htmlFor="alert-type">{t('Rule type')}</label>
                <select
                  id="alert-type"
                  value={formType}
                  onChange={(e) => { setFormType(e.target.value as RuleType | ''); setFormErrors({}); setFormTarget(''); }}
                  aria-describedby={formErrors.type ? 'err-type' : undefined}
                  style={{ minWidth: 180 }}
                >
                  <option value="">Choose…</option>
                  {(Object.keys(RULE_LABELS) as RuleType[]).map((t) => (
                    <option key={t} value={t}>{RULE_LABELS[t]}</option>
                  ))}
                </select>
                {formErrors.type && <span id="err-type" className={styles.fieldErr} role="alert">{formErrors.type}</span>}
                {formType && <span className="small muted" style={{ marginTop: 2 }}>{RULE_DESCS[formType]}</span>}
              </div>

              {/* Code */}
              <div className={`${styles.fieldWrap} ${styles.codeWrap}`}>
                <label htmlFor="alert-code">{t('Company code')}</label>
                <input
                  id="alert-code"
                  type="text"
                  role="combobox"
                  aria-expanded={showSuggests && suggestions.length > 0}
                  aria-controls={showSuggests && suggestions.length > 0 ? 'alert-code-list' : undefined}
                  aria-activedescendant={showSuggests && suggestions.length > 0 && hiIdx >= 0 ? `alert-opt-${hiIdx}` : undefined}
                  aria-autocomplete="list"
                  value={formCode}
                  placeholder="e.g. GP"
                  autoComplete="off"
                  style={{ width: 120 }}
                  onChange={(e) => { setFormCode(e.target.value.toUpperCase()); setFormErrors({}); setShowSuggests(true); setHiIdx(-1); }}
                  onFocus={() => setShowSuggests(true)}
                  onBlur={() => setShowSuggests(false)}
                  onKeyDown={(e) => {
                    if (!showSuggests || !suggestions.length) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHiIdx((h) => (h + 1) % suggestions.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHiIdx((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
                    } else if (e.key === 'Enter' && hiIdx >= 0) {
                      e.preventDefault();
                      const c = suggestions[hiIdx];
                      if (c) { setFormCode(c.code); setShowSuggests(false); setFormErrors({}); setHiIdx(-1); }
                    } else if (e.key === 'Escape') {
                      setShowSuggests(false);
                      setHiIdx(-1);
                    }
                  }}
                  aria-describedby={formErrors.code ? 'err-code' : undefined}
                />
                {formErrors.code && <span id="err-code" className={styles.fieldErr} role="alert">{formErrors.code}</span>}
                {showSuggests && suggestions.length > 0 && (
                  <div
                    className={styles.suggests}
                    id="alert-code-list"
                    role="listbox"
                    aria-label="Company suggestions"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {suggestions.map((c, i) => (
                      <button
                        key={c.code}
                        id={`alert-opt-${i}`}
                        type="button"
                        role="option"
                        aria-selected={i === hiIdx}
                        onClick={() => {
                          setFormCode(c.code);
                          setShowSuggests(false);
                          setFormErrors({});
                          setHiIdx(-1);
                        }}
                      >
                        <span className={`mono ${styles.sugCode}`}>{c.code}</span>
                        <span className={styles.sugName}>{c.name}</span>
                        {c.price != null && <span className={`mono ${styles.sugPrice}`}>৳{c.price.toFixed(2)}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Target / threshold */}
              {needsTargetField && (
                <div className={styles.fieldWrap}>
                  <label htmlFor="alert-target">{targetLabel}</label>
                  <input
                    id="alert-target"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formTarget}
                    placeholder={companyCodes.has(upperCode) && priceByCode[upperCode] != null ? String(priceByCode[upperCode]) : undefined}
                    style={{ width: 120 }}
                    onChange={(e) => { setFormTarget(e.target.value); setFormErrors({}); }}
                    aria-describedby={formErrors.target ? 'err-target' : undefined}
                  />
                  {formErrors.target && <span id="err-target" className={styles.fieldErr} role="alert">{formErrors.target}</span>}
                </div>
              )}

              {/* Days before (dividend only) */}
              {formType === 'dividend' && (
                <div className={styles.fieldWrap}>
                  <label htmlFor="alert-days">Days before last buy</label>
                  <input
                    id="alert-days"
                    type="number"
                    min="0"
                    max="30"
                    step="1"
                    value={formDays}
                    style={{ width: 80 }}
                    onChange={(e) => { setFormDays(e.target.value); setFormErrors({}); }}
                    aria-describedby={formErrors.days ? 'err-days' : undefined}
                  />
                  {formErrors.days && <span id="err-days" className={styles.fieldErr} role="alert">{formErrors.days}</span>}
                </div>
              )}

              <div className={styles.fieldWrap} style={{ justifyContent: 'flex-end' }}>
                <label style={{ visibility: 'hidden' }}>{'‎'}</label>
                <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>Add rule</button>
                {formErrors.form && <span className={styles.fieldErr} role="alert">{formErrors.form}</span>}
              </div>
            </div>
            {/* Quick-fill chips for ±% targets */}
            {(formType === 'price_below' || formType === 'price_above') && companyCodes.has(upperCode) && priceByCode[upperCode] != null && (() => {
              const price = priceByCode[upperCode]!;
              const pcts = formType === 'price_below' ? [-5, -10, -15] : [5, 10, 20];
              return (
                <div className={styles.chips}>
                  {pcts.map((pct) => {
                    const val = Math.round(price * (1 + pct / 100) * 100) / 100;
                    return (
                      <button key={pct} type="button" className={`btn ${styles.chipBtn}`}
                        onClick={() => setFormTarget(val.toFixed(2))}
                      >
                        {pct > 0 ? '+' : ''}{pct}% · ৳{val.toFixed(2)}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </form>
          {/* Price info line — shown when a valid company code is entered */}
          {companyCodes.has(upperCode) && (() => {
            const co = companies.find((c) => c.code === upperCode);
            if (!co) return null;
            const price = priceByCode[upperCode];
            const priceStr = price != null ? `৳${price.toFixed(2)}` : 'no price yet';
            const rangeStr = co.weekLow52 != null && co.weekHigh52 != null
              ? ` · 52-week ৳${co.weekLow52.toFixed(2)} – ৳${co.weekHigh52.toFixed(2)}`
              : '';
            return <div className={styles.priceInfo}>{upperCode} now {priceStr}{rangeStr}</div>;
          })()}
        </div>
      </section>

      {/* Recent alerts history */}
      <section>
        <h2><Tr text="Recent alerts" /></h2>
        <div className="panel">
          {!store.history.length ? (
            <p className="muted" style={{ padding: '8px 0' }}>No alerts have fired yet.</p>
          ) : (
            store.history.map((e) => (
              <div key={e.key} className={styles.histItem}>
                <div>{e.message}</div>
                <div className={styles.histDate}>{e.date}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
