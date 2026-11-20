import fs from 'node:fs';
import path from 'node:path';
import { parseCompanyPage } from './company.ts';
import { fetchDse } from './dse.ts';
import { noUndefined } from './extract.ts';

// data/ is the committed copy the daily GitHub Action refreshes; `next dev` on the laptop writes its own git-ignored cache so pulls never conflict.
export const SHARED_DIR = 'data';
export const ownDir = (): string => (process.env.NODE_ENV === 'development' ? '.cache-data' : SHARED_DIR);
const dataPath = (name: string, dir = ownDir()) => path.join(process.cwd(), dir, name);
const STORE_RELOAD_MS = 5 * 60_000;

export type Company = NonNullable<ReturnType<typeof parseCompanyPage>>;
export type StoredCompany = Company & { fetchedAt: number };

function readFrom<T>(name: string, dir: string): T | null {
  try { return JSON.parse(fs.readFileSync(dataPath(name, dir), 'utf8'), noUndefined) as T; } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`data file ${name} unreadable`, e);
    return null;
  }
}

// Per code the copy fetched last wins, so a newer committed copy (after a pull) replaces an older local one.
const readCompanies = (): Record<string, StoredCompany> => {
  const shared = readFrom<Record<string, StoredCompany>>('companies.json', SHARED_DIR) ?? {};
  return ownDir() === SHARED_DIR ? shared : newest(shared, readFrom<Record<string, StoredCompany>>('companies.json', ownDir()) ?? {});
};

function writeJson(name: string, value: unknown): void {
  try {
    fs.mkdirSync(path.join(process.cwd(), ownDir()), { recursive: true });
    fs.writeFileSync(dataPath(name + '.tmp'), JSON.stringify(value));
    fs.renameSync(dataPath(name + '.tmp'), dataPath(name));
  } catch (e) { console.error(`could not save data file ${name}`, e); }
}

let companies: Record<string, StoredCompany> = {};
let loadedAt = 0;
let version = 0;

export function allCompanies(): Record<string, StoredCompany> {
  if (Date.now() - loadedAt > STORE_RELOAD_MS) {
    companies = newest(readCompanies(), companies);
    loadedAt = Date.now();
    version++;
  }
  return companies;
}

export function storeVersion(): number {
  allCompanies();
  return version;
}

// A company fetched on demand can be newer than the file; per code, keep the copy fetched last.
export function newest(file: Record<string, StoredCompany>, current: Record<string, StoredCompany>): Record<string, StoredCompany> {
  const out = { ...file };
  for (const [code, c] of Object.entries(current)) if (!out[code] || (c.fetchedAt ?? 0) > (out[code].fetchedAt ?? 0)) out[code] = c;
  return out;
}

export const saveCompanies = () => writeJson('companies.json', newest(readCompanies(), companies));

export class NotFoundError extends Error {}

export async function fetchCompany(code: string): Promise<StoredCompany> {
  const parsed = parseCompanyPage(await (await fetchDse('/company/' + encodeURIComponent(code))).text());
  if (!parsed) throw new NotFoundError(`company page for ${code} has no data block`);
  const stored = { ...parsed, fetchedAt: Date.now() };
  allCompanies()[code] = stored;
  version++;
  return stored;
}

export interface LastSession { date: string; index: unknown; intraday: { t: string; value: number }[] }

export function readLastSession(): LastSession | null {
  const own = readFrom<LastSession>('last-session.json', ownDir());
  const shared = ownDir() === SHARED_DIR ? null : readFrom<LastSession>('last-session.json', SHARED_DIR);
  return own && shared ? (shared.date > own.date ? shared : own) : own ?? shared;
}
export const saveLastSession = (s: LastSession) => writeJson('last-session.json', s);
