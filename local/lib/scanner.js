const fs = require('node:fs');
const path = require('node:path');
const { parseCompanyPage, DATA_VERSION } = require('./company');

const STORE_FILE = path.join(__dirname, '..', 'data', 'companies.json');
const SCAN_DELAY_MS = 2_000;
const STALE_MS = 24 * 60 * 60_000;
const SAVE_EVERY = 10;

function createScanner({ fetchText, listCodes, log = console }) {
  const store = load();
  const state = { running: false, done: 0, total: 0, failed: [], startedAt: null };

  function load() {
    try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch (e) {
      if (e.code !== 'ENOENT') log.warn('saved company data unreadable, starting a fresh scan', e);
      return {};
    }
  }

  function trySave() {
    try { save(); } catch (e) { log.error('could not save company data', e); }
  }

  function save() {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE + '.tmp', JSON.stringify(store));
    fs.renameSync(STORE_FILE + '.tmp', STORE_FILE);
  }

  async function fetchCompany(code) {
    const parsed = parseCompanyPage(await fetchText('/company/' + encodeURIComponent(code)));
    if (!parsed) throw Object.assign(new Error(`company page for ${code} has no data block`), { notFound: true });
    store[code] = { ...parsed, fetchedAt: Date.now() };
    return store[code];
  }

  async function run() {
    if (state.running) return;
    state.running = true;
    try {
      const codes = await listCodes();
      const todo = codes.filter((c) => !store[c] || store[c].version !== DATA_VERSION || Date.now() - store[c].fetchedAt > STALE_MS);
      Object.assign(state, { done: codes.length - todo.length, total: codes.length, failed: [], startedAt: Date.now() });
      for (const [i, code] of todo.entries()) {
        try { await fetchCompany(code); } catch (e) {
          log.warn(`scan skipped ${code}`, e);
          state.failed.push(code);
        }
        state.done++;
        if (i % SAVE_EVERY === SAVE_EVERY - 1) trySave();
        await new Promise((r) => setTimeout(r, SCAN_DELAY_MS));
      }
    } finally {
      state.running = false;
      trySave();
    }
  }

  return { store, state, run, fetchCompany, save };
}

module.exports = { createScanner, STALE_MS };
