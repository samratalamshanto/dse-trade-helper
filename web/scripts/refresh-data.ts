// Run by .github/workflows/refresh-data.yml after the close: refetch every listed company and take the scorecard snapshot.
import { DATA_VERSION } from '../lib/company.ts';
import { livePrices } from '../lib/dse.ts';
import { takeSnapshot } from '../lib/scorecard-store.ts';
import { allCompanies, fetchCompany, saveCompanies } from '../lib/store.ts';

const PAUSE_MS = 4_000; // 15 pages a minute, the same pace as the in-app scan
const SAVE_EVERY = 25;
const MIN_OK_SHARE = 0.8;

const live = await livePrices();
const codes = Object.values(live).filter((p) => p.assetType === 'EQ').map((p) => p.code).sort();
let ok = 0;
const failed: string[] = [];
for (const [i, code] of codes.entries()) {
  try { await fetchCompany(code); ok++; } catch (e) {
    failed.push(code);
    console.warn(`refresh-data: ${code} failed`, e);
  }
  if ((i + 1) % SAVE_EVERY === 0) { saveCompanies(); console.log(`refresh-data: ${i + 1}/${codes.length}`); }
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}
saveCompanies();
const stale = Object.values(allCompanies()).filter((c) => c.version !== DATA_VERSION).length;
console.log(`refresh-data: ${ok}/${codes.length} refreshed, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}, ${stale} stored rows on an old parser`);

try { console.log('refresh-data: scorecard', JSON.stringify(await takeSnapshot())); } catch (e) { console.error('refresh-data: scorecard snapshot failed', e); }

// A mostly failed run (DSE down) keeps the old file in git rather than publishing a half-empty one.
if (!codes.length || ok / codes.length < MIN_OK_SHARE) { console.error('refresh-data: too many failures, not publishing'); process.exit(1); }
