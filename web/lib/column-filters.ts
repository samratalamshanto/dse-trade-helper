import { rangePct } from './dividend-checks.ts';

// Column filters on the 52-week range page, kept in the address: ?f=score:gt:50,pos:lt:20&div=up,none
export interface FilterRow { price: number | null; position: number | null; aboveLowPct: number | null; score: number | null; recordDate?: string | null }

export const COLUMN_FIELDS = [
  { key: 'score', label: 'Score' }, { key: 'price', label: 'Price' }, { key: 'pos', label: 'Position % of range' },
  { key: 'above', label: '% above low' }, { key: 'rec', label: 'Record date' },
] as const;
export type FieldKey = (typeof COLUMN_FIELDS)[number]['key'];
export const OPS = [['gt', '>'], ['lt', '<'], ['eq', '=']] as const;
export type Op = (typeof OPS)[number][0];
export interface Condition { field: FieldKey; op: Op; value: string }

export const DIV_STATES = [['up', 'Upcoming'], ['past', 'Passed'], ['none', 'No value']] as const;
export type DivState = (typeof DIV_STATES)[number][0];
export const DIV_LABEL = Object.fromEntries(DIV_STATES) as Record<DivState, string>;

const FIELD_KEYS = new Set<string>(COLUMN_FIELDS.map((f) => f.key));
const OP_KEYS = new Set<string>(OPS.map((o) => o[0]));
const DIV_KEYS = new Set<string>(DIV_STATES.map((d) => d[0]));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const round1 = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

// Unknown fields or operators in the address are dropped; an empty value is kept so a new row can be typed into.
export function parseConditions(raw: string | null): Condition[] {
  return (raw || '').split(',').filter(Boolean).map((part) => {
    const [field, op, ...rest] = part.split(':');
    return { field, op, value: rest.join(':') } as Condition;
  }).filter((c) => FIELD_KEYS.has(c.field) && OP_KEYS.has(c.op));
}

export const formatConditions = (list: readonly Condition[]): string => list.map((c) => `${c.field}:${c.op}:${c.value.replace(/[,:]/g, '')}`).join(',');

export const parseDivStates = (raw: string | null): DivState[] => (raw || '').split(',').filter((s): s is DivState => DIV_KEYS.has(s));

export const divState = (recordDate: string | null | undefined, today: string): DivState =>
  !recordDate ? 'none' : recordDate >= today ? 'up' : 'past';

// The value as the table shows it, so "=" matches what the reader sees (position is a whole percent, rounded down).
function cell(r: FilterRow, field: FieldKey): number | string | null {
  if (field === 'rec') return r.recordDate ?? null;
  if (field === 'pos') return r.position == null ? null : rangePct(r.position);
  if (field === 'above') return round1(r.aboveLowPct);
  if (field === 'score') return r.score;
  return r.price;
}

// A row with no value fails a condition; a condition with a value that is not a number (or a date) is ignored.
export function passesCondition(r: FilterRow, c: Condition): boolean {
  const want = c.value.trim();
  const isDate = c.field === 'rec';
  if (isDate ? !ISO_DATE.test(want) : want === '' || !Number.isFinite(Number(want))) return true;
  const have = cell(r, c.field);
  if (have == null) return false;
  const target = isDate ? want : Number(want);
  return c.op === 'gt' ? have > target : c.op === 'lt' ? have < target : have === target;
}

export const columnFilterTest = (conditions: readonly Condition[], states: readonly DivState[], today: string) => (r: FilterRow): boolean =>
  (!states.length || states.includes(divState(r.recordDate, today))) && conditions.every((c) => passesCondition(r, c));
