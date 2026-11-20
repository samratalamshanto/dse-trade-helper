import fs from 'node:fs';
import path from 'node:path';
import { parseCompanyPage } from './company.ts';
import { fetchDse } from './dse.ts';
import { noUndefined } from './extract.ts';

// shortcut: local JSON files only; phase 4 switches these reads/writes to Vercel Blob on the hosted site.
const dataPath = (name: string) => path.join(process.cwd(), 'data', name);
const STORE_RELOAD_MS = 5 * 60_000;

export type Company = NonNullable<ReturnType<typeof parseCompanyPage>>;
export type StoredCompany = Company & { fetchedAt: number };

function readJson<T>(name: string): T | null {
  try { return JSON.parse(fs.readFileSync(dataPath(name), 'utf8'), noUndefined) as T; } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`data file ${name} unreadable`, e);
    return null;
  }
}

function writeJson(name: string, value: unknown): void {
  try {
    fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
    fs.writeFileSync(dataPath(name + '.tmp'), JSON.stringify(value));
    fs.renameSync(dataPath(name + '.tmp'), dataPath(name));
  } catch (e) { console.error(`could not save data file ${name}`, e); }
}

let companies: Record<string, StoredCompany> = {};
let loadedAt = 0;
let version = 0;

export function allCompanies(): Record<string, StoredCompany> {
  if (Date.now() - loadedAt > STORE_RELOAD_MS) {
    companies = newest(readJson<Record<string, StoredCompany>>('companies.json') ?? {}, companies);
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

export const saveCompanies = () => writeJson('companies.json', newest(readJson<Record<string, StoredCompany>>('companies.json') ?? {}, companies));

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

export const readLastSession = () => readJson<LastSession>('last-session.json');
export const saveLastSession = (s: LastSession) => writeJson('last-session.json', s);
