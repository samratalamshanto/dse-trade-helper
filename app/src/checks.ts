import { ACTION_TEXT, parseSettings, type LimitSettings, type Limits, type PositionAction } from '../../web/lib/positions.ts';
import type { Tone } from './format.ts';
import type { Palette } from './theme.ts';

export type { LimitSettings, Limits };

export type CheckTone = (typeof ACTION_TEXT)[PositionAction]['tone'];

export interface HoldingCheck { action: PositionAction; label: string; tone: CheckTone; reasons: string[]; plPct: number | null }

export const CHECK_TONE: Record<CheckTone, Tone> = { bad: 'down', warn: 'warn', info: 'link', good: 'up', neutral: 'muted' };

export const checkColor = (tone: string, c: Palette): string => c[CHECK_TONE[tone as CheckTone] ?? 'muted'];

export const LIMITS_ERROR = 'Stop-loss and target must be percentages between 1 and 95.';

export interface StoredChecks { date: string; labels: Record<string, string> }

export function parseStoredChecks(raw: string | null): StoredChecks | null {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<StoredChecks> | null;
    if (!v || typeof v.date !== 'string' || !v.labels || typeof v.labels !== 'object') return null;
    return { date: v.date, labels: v.labels };
  } catch {
    return null;
  }
}

// A holding is "changed" only when an earlier label exists and differs; a new holding has nothing to compare with.
export function changedCodes(stored: StoredChecks | null, labels: Record<string, string>): string[] {
  if (!stored) return [];
  return Object.keys(labels).filter((code) => code in stored.labels && stored.labels[code] !== labels[code]);
}

export interface LimitRow { code: string; stopPct: string; targetPct: string }

// Uses the server parser, so the client accepts exactly what the server accepts.
export function limitsFromForm(def: { stopPct: string; targetPct: string }, rows: readonly LimitRow[]): { ok: true; value: LimitSettings } | { ok: false; error: string } {
  const pct = (x: string) => (x.trim() === '' ? NaN : Number(x));
  const value = parseSettings({
    default: { stopPct: pct(def.stopPct), targetPct: pct(def.targetPct) },
    perCode: Object.fromEntries(rows.map((r) => [r.code, { stopPct: pct(r.stopPct), targetPct: pct(r.targetPct) }])),
  });
  return value ? { ok: true, value } : { ok: false, error: LIMITS_ERROR };
}
