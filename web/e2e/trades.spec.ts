import type { Page, Route } from '@playwright/test';
import { test, expect, openSettings } from './fixtures';

// The real /api/trades writes to the owner's Google Sheet: every request is mocked, anything unmocked is aborted.
const KEY = 'k'.repeat(20);
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const LIST = {
  warnings: [], badRows: [],
  trades: [
    { id: 't1', date: '2026-01-05', code: 'GP', side: 'BUY', quantity: 100, price: 250, commission: 50, note: '', source: 'manual', createdAt: '' },
    { id: 't2', date: '2026-02-05', code: 'GP', side: 'SELL', quantity: 40, price: 300, commission: 30, note: '', source: 'manual', createdAt: '' },
  ],
  holdings: [{ code: 'GP', shares: 60, avgCost: 250.5, invested: 15030, realised: 1950, trades: 2, price: 280, value: 16800, unrealised: 1770,
    limits: { stopPct: 10, targetPct: 20 },
    check: { action: 'take-profit', label: 'Above your target', tone: 'warn', reasons: ['Up 21.0% — past your 20% target', 'P/E is high against its own 5-year history'], plPct: 21 } }],
  settings: { default: { stopPct: 10, targetPct: 20 }, perCode: {} },
};

// Sheet mode: the key is already saved in this browser; then unfolds "Add or import trades" (folded once trades exist).
async function unlock(page: Page) {
  await page.addInitScript((k) => localStorage.setItem('tradesKey', k), KEY);
  await page.goto('/portfolio');
  await page.getByText('Add or import trades').click();
}

const syncPanel = (page: Page) => page.locator('details').filter({ has: page.getByText('Sync with my Google Sheet') });

test.describe('/trades (API mocked)', () => {
  test('no password box at first; a wrong password in the sync panel shows the error and stays in this browser', async ({ page }) => {
    test.info().annotations.push({ type: 'note', description: 'Chrome logs the mocked 401 as a console error; only that line is allowed.' });
    await page.route('**/api/trades**', (r) => json(r, 401, { error: 'Wrong trades key.' }));
    // The old /trades address still works: it opens the Portfolio.
    await page.goto('/trades');
    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(page.getByRole('heading', { name: 'Portfolio', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Password')).toBeHidden();
    await openSettings(page);
    await page.getByText('Sync with my Google Sheet').click();
    await syncPanel(page).getByText('For the site owner').click();
    await syncPanel(page).getByLabel('Password').fill(KEY);
    await syncPanel(page).getByRole('button', { name: 'Connect' }).click();
    await expect(syncPanel(page).getByRole('alert')).toHaveText('That password is not right.');
    await expect(syncPanel(page).getByRole('button', { name: 'Connect' })).toBeVisible();
    // No key is kept: the dev key server answers an empty key, which is saved as ''.
    expect(await page.evaluate(() => localStorage.getItem('tradesKey') ?? '')).toBe('');
  });
  test.use({ allowedConsole: [/status of 40[01]/] });

  test('localhost: key from the dev key server opens the list without the key box', async ({ page }) => {
    await page.route('http://127.0.0.1:3011/trades-key', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ key: KEY }) }));
    await page.route('**/api/trades**', (r) => json(r, r.request().headers()['x-trades-key'] === KEY ? 200 : 401, LIST));
    await page.goto('/portfolio');
    await expect(page.getByRole('heading', { name: 'All trades' })).toBeVisible();
    await openSettings(page);
    await page.getByText('Sync with my Google Sheet').click();
    await expect(syncPanel(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
  });

  test('list: holdings and trades table, sell amount = qty*price - fee', async ({ page }) => {
    await page.route('**/api/trades**', (r) => json(r, 200, LIST));
    await unlock(page);
    const holdings = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Holdings', exact: true }) });
    await expect(holdings.locator('tbody tr').filter({ hasText: 'GP' })).toContainText('60');
    const trades = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'All trades' }) });
    await expect(trades.locator('tbody tr').filter({ hasText: 'SELL 40 GP' })).toContainText('৳11,970.00'); // 40*300-30
    await expect(trades.locator('tbody tr').filter({ hasText: 'BUY 100 GP' })).toContainText('৳25,050.00'); // 100*250+50
  });

  test('import preview with 0 new says nothing to add', async ({ page }) => {
    await page.route('**/api/trades/import', (r) => json(r, 200, { date: '2026-02-05', added: [], skipped: [{ date: '2026-02-05', code: 'GP', side: 'BUY', quantity: 1, price: 1, commission: null, note: '' }], errors: [], saved: false }));
    await page.route('**/api/trades', (r) => json(r, 200, LIST));
    await unlock(page);
    await page.getByLabel('Choose broker file (.xlsx)').setInputFiles({ name: 'order_summary_2026-02-05.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
    await expect(page.getByText(/Nothing new to add/)).toBeVisible();
    await expect(page.getByText('0 to add, 1 already in your trades.')).toBeVisible();
  });

  test('add-trade form posts the right JSON', async ({ page }) => {
    let posted: unknown;
    await page.route('**/api/trades', async (r) => {
      if (r.request().method() === 'POST') { posted = r.request().postDataJSON(); return json(r, 201, {}); }
      return json(r, 200, LIST);
    });
    await unlock(page);
    await expect(page.getByRole('heading', { name: 'Add a trade' })).toBeVisible();
    await page.getByLabel('Date', { exact: true }).fill('2026-03-02');
    await page.getByLabel('Code').fill('gp');
    await page.getByRole('combobox', { name: /^Side/ }).selectOption('SELL');
    await page.getByLabel('Quantity').fill('10');
    await page.getByLabel('Price ৳').fill('281.5');
    await page.getByLabel('Commission ৳').fill('5');
    await page.getByLabel('Note').fill('e2e');
    const req = page.waitForRequest((q) => q.method() === 'POST' && q.url().endsWith('/api/trades'));
    await page.getByRole('button', { name: 'Add trade' }).click();
    expect((await req).headers()['x-trades-key']).toBe(KEY);
    expect(posted).toEqual({ date: '2026-03-02', code: 'GP', side: 'SELL', quantity: '10', price: '281.5', commission: '5', note: 'e2e', account: 'real' });
  });

  test('holding check: one coloured status per row; tap it to see the reasons and limits', async ({ page }) => {
    await page.route('**/api/trades**', (r) => json(r, 200, LIST));
    await unlock(page);
    await expect(page.getByText('The status comes from fixed rules on your numbers and public DSE data. It is a learning aid, not advice. Tap a status to see why.')).toBeVisible();
    const tbody = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Holdings', exact: true }) }).locator('tbody');
    const row = tbody.locator('tr').filter({ hasText: 'GP' });
    const reason = tbody.getByText('Up 21.0% — past your 20% target');
    await expect(reason).toBeHidden();
    await row.getByRole('button', { name: /Above your target/ }).click();
    await expect(row.getByRole('button', { name: /Above your target/ }).locator('.pill')).toHaveText('Above your target');
    await expect(reason).toBeVisible();
    await expect(tbody.getByText('Your limits: stop-loss 10%, target 20%')).toBeVisible();
  });

  test('selling facts: profit with dividends on the shares held at each record date, break-even and portfolio share', async ({ page }) => {
    await page.route('**/api/trades**', (r) => json(r, 200, LIST));
    // 20 Jan: 100 shares held × ৳10 = ৳1,000; 3 Mar (after the sell of 40): 60 × ৳10.50 = ৳630; 1 Jan is before the buy.
    await page.route('**/api/company/GP', (r) => json(r, 200, { company: { faceValue: 10, events: { declarations: [
      { recordDate: '2026-03-03', cashPct: 105 }, { recordDate: '2026-01-20', cashPct: 100 }, { recordDate: '2026-01-01', cashPct: 100 }] } } }));
    await unlock(page);
    await expect(page.locator('.panel').filter({ hasText: 'Profit / loss with dividends' }).first()).toContainText('+৳3,400.00');
    await expect(page.getByText('includes ৳1,630.00 cash dividends')).toBeVisible();
    const tbody = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Holdings', exact: true }) }).locator('tbody');
    await tbody.locator('tr').filter({ hasText: 'GP' }).getByRole('button', { name: /Details/ }).click();
    await expect(tbody.getByText('(+৳1,770.00 on price + ৳1,630.00 cash dividends)')).toBeVisible();
    await expect(tbody.getByText('Break-even after the 0.4% sell commission')).toContainText('৳251.51 (-10.2% from the price now)');
    await expect(tbody.getByText('100% of your portfolio — above the 25% line the planner uses')).toBeVisible();
  });

  test('my limits: save sends the PUT, shows the 400 message inline, then saves and reloads', async ({ page }) => {
    const puts: unknown[] = [];
    let gets = 0;
    await page.route('**/api/trades/settings', (r) => {
      puts.push(r.request().postDataJSON());
      return puts.length === 1 ? json(r, 400, { error: 'Stop-loss and target must be percentages between 1 and 95.' }) : json(r, 200, r.request().postDataJSON());
    });
    await page.route('**/api/trades', (r) => { gets++; return json(r, 200, LIST); });
    await unlock(page);
    await openSettings(page);
    const panel = page.locator('form').filter({ has: page.getByRole('heading', { name: 'My limits' }) });
    await panel.getByLabel('Default stop-loss %').fill('12');
    await panel.getByLabel('Holding with its own limits').selectOption('GP');
    await panel.getByRole('button', { name: 'Add override' }).click();
    await panel.getByLabel('GP target %').fill('30');
    await panel.getByRole('button', { name: 'Save limits' }).click();
    await expect(panel.getByRole('alert')).toHaveText('Stop-loss and target must be percentages between 1 and 95.');
    expect(puts[0]).toEqual({ default: { stopPct: 12, targetPct: 20 }, perCode: { GP: { stopPct: 12, targetPct: 30 } } });
    await panel.getByRole('button', { name: 'Remove GP override' }).click();
    const before = gets;
    await panel.getByRole('button', { name: 'Save limits' }).click();
    await expect.poll(() => gets).toBeGreaterThan(before);
    expect(puts[1]).toEqual({ default: { stopPct: 12, targetPct: 20 }, perCode: {} });
    await expect(panel.getByRole('alert')).toHaveCount(0);
  });

  test('import: a failed second file clears the first file preview and shows only the error', async ({ page }) => {
    let n = 0;
    await page.route('**/api/trades/import', (r) => (++n === 1
      ? json(r, 200, { date: '2026-11-19', added: [], skipped: [], errors: [], saved: false })
      : json(r, 400, { error: 'The trade date could not be read from the file name. Pick the date and upload again.' })));
    await page.route('**/api/trades', (r) => json(r, 200, LIST));
    await unlock(page);
    const file = page.getByLabel('Choose broker file (.xlsx)');
    await file.setInputFiles({ name: 'order_summary_2026-11-19.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
    await expect(page.getByText('0 to add, 0 already in your trades.')).toBeVisible();
    await file.setInputFiles({ name: 'export.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
    await expect(page.getByRole('alert').filter({ hasText: /trade date could not be read/ })).toBeVisible();
    await expect(page.getByText('0 to add, 0 already in your trades.')).toHaveCount(0);
  });

  test('practice account: banner, own list, no import, adds as paper, reset deletes only practice trades', async ({ page }) => {
    const PAPER = { ...LIST, account: 'paper', holdings: [], settings: LIST.settings,
      trades: [{ id: 'p1', date: '2026-11-19', code: 'BXPHARMA', side: 'BUY', quantity: 5, price: 120, commission: null, note: '', source: 'manual', createdAt: '', account: 'paper' }] };
    const gets: string[] = [];
    const deleted: string[] = [];
    let posted: unknown;
    await page.route((u) => u.pathname.startsWith('/api/trades'), (r) => {
      const req = r.request();
      const url = new URL(req.url());
      if (req.method() === 'DELETE') { deleted.push(url.pathname.split('/').pop()!); return json(r, 200, { deleted: true }); }
      if (req.method() === 'POST') { posted = req.postDataJSON(); return json(r, 201, {}); }
      gets.push(url.search);
      return json(r, 200, url.searchParams.get('account') === 'paper' ? PAPER : LIST);
    });
    await unlock(page);
    await expect(page.getByRole('button', { name: 'Real', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('PRACTICE — not real money.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await expect(page.getByText('PRACTICE — not real money.')).toBeVisible();
    expect(gets).toEqual(['', '?account=paper']);
    const trades = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'All trades' }) });
    await expect(trades.locator('tbody tr')).toHaveCount(1);
    await expect(trades).toContainText('BXPHARMA');
    await expect(page.getByRole('heading', { name: /Import from your broker/ })).toHaveCount(0);

    await page.getByLabel('Code').fill('gp');
    await page.getByLabel('Quantity').fill('2');
    await page.getByLabel('Price ৳').fill('226.9');
    await page.getByRole('button', { name: 'Add practice trade' }).click();
    await expect.poll(() => posted).toMatchObject({ code: 'GP', quantity: '2', account: 'paper' });

    page.once('dialog', (d) => { expect(d.message()).toContain('Real trades are not touched'); void d.accept(); });
    await page.getByRole('button', { name: 'Reset practice account' }).click();
    await expect.poll(() => deleted).toEqual(['p1']);
  });

  test('a slow real-account answer arriving after Practice is chosen never replaces the practice list', async ({ page }) => {
    const PAPER = { ...LIST, account: 'paper', holdings: [],
      trades: [{ id: 'p1', date: '2026-11-19', code: 'BXPHARMA', side: 'BUY', quantity: 5, price: 120, commission: null, note: '', source: 'manual', createdAt: '', account: 'paper' }] };
    let realCalls = 0;
    await page.route((u) => u.pathname.startsWith('/api/trades'), async (r) => {
      const paper = new URL(r.request().url()).searchParams.get('account') === 'paper';
      // The second real load (after unlock) is held back until after the practice answer.
      if (!paper && ++realCalls === 2) await new Promise((res) => setTimeout(res, 1500));
      return json(r, 200, paper ? PAPER : { ...LIST, account: 'real' });
    });
    await unlock(page);
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.getByRole('button', { name: 'Real', exact: true }).click();
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForTimeout(2000);
    const trades = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'All trades' }) });
    await expect(trades.locator('tbody tr')).toHaveCount(1);
    await expect(trades).toContainText('BXPHARMA');
    await expect(page.getByRole('heading', { name: /My limits/ })).toHaveCount(0);
  });

  test('while a trade is being saved, Real/Practice cannot be switched, so the reload cannot land on the other account', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((res) => { release = res; });
    await page.route((u) => u.pathname.startsWith('/api/trades'), async (r) => {
      if (r.request().method() === 'POST') { await held; return json(r, 201, {}); }
      return json(r, 200, { ...LIST, account: 'real' });
    });
    await unlock(page);
    await page.getByLabel('Code').fill('gp');
    await page.getByLabel('Quantity').fill('2');
    await page.getByLabel('Price ৳').fill('226.9');
    await page.getByRole('button', { name: 'Add trade' }).click();
    await expect(page.getByRole('button', { name: 'Practice', exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole('button', { name: 'Practice', exact: true })).toBeEnabled();
  });

  test('telegram: browser mode points to the Alerts page; after connecting, the test button posts with the key', async ({ page }) => {
    await page.route('**/api/trades**', (r) => json(r, 200, LIST));
    await page.route('**/api/notify/test', (r) => json(r, 200, { sent: true }));
    await page.goto('/portfolio');
    await openSettings(page);
    await expect(page.getByText('Sign in with Google (in the panel below) to get Telegram alerts from your own Sheet.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send test to Telegram' })).toHaveCount(0);
    await page.getByText('Sync with my Google Sheet').click();
    await syncPanel(page).getByText('For the site owner').click();
    await syncPanel(page).getByLabel('Password').fill(KEY);
    await syncPanel(page).getByRole('button', { name: 'Connect' }).click();
    await expect(page.getByRole('heading', { name: 'Phone alerts' })).toBeVisible();
    const req = page.waitForRequest((q) => q.method() === 'POST' && q.url().endsWith('/api/notify/test'));
    await page.getByRole('button', { name: 'Send test to Telegram' }).click();
    expect((await req).headers()['x-trades-key']).toBe(KEY);
    await expect(page.getByRole('status').filter({ hasText: 'Sent — check Telegram.' })).toBeVisible();
    await syncPanel(page).getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByText('Sign in with Google (in the panel below) to get Telegram alerts from your own Sheet.', { exact: false })).toBeVisible();
  });
});

test.describe('portfolio: holdings saved by the old browser-only page (API mocked)', () => {
  test('one click moves them into the trades as buys, then the browser copy is cleared', async ({ page }) => {
    const posted: Record<string, string>[] = [];
    await page.route('**/api/trades', async (r) => {
      if (r.request().method() === 'POST') { posted.push(r.request().postDataJSON()); return json(r, 201, {}); }
      return json(r, 200, LIST);
    });
    await page.addInitScript(() => localStorage.setItem('portfolio', JSON.stringify([{ code: 'ACI', shares: 10, buyPrice: 180, buyDate: '2026-03-01' }, { code: 'ROBI', shares: 5, buyPrice: 30 }])));
    await unlock(page);
    await expect(page.getByText('2 holdings are saved only in this browser')).toBeVisible();
    await page.getByRole('button', { name: 'Move 2 into my trades' }).click();
    await expect(page.getByText('2 holdings are saved only in this browser')).toHaveCount(0);
    expect(posted.map((p) => [p.code, p.side, p.quantity, p.price, p.date])).toEqual([['ACI', 'BUY', '10', '180', '2026-03-01'], ['ROBI', 'BUY', '5', '30', posted[1].date]]);
    expect(await page.evaluate(() => localStorage.getItem('portfolio'))).toBe('[]');
  });

  test('a move that fails half-way keeps only the holdings not yet saved, so a retry never adds one twice', async ({ page }) => {
    let posts = 0;
    await page.route('**/api/trades', (r) => (r.request().method() === 'POST' ? (++posts === 1 ? json(r, 201, {}) : json(r, 503, { error: 'Sheet is busy.' })) : json(r, 200, LIST)));
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('portfolio', JSON.stringify([{ code: 'ACI', shares: 10, buyPrice: 180 }, { code: 'ROBI', shares: 5, buyPrice: 30 }])); } });
    await unlock(page);
    await page.getByRole('button', { name: 'Move 2 into my trades' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Sheet is busy.' })).toBeVisible();
    const left = JSON.parse((await page.evaluate(() => localStorage.getItem('portfolio')))!) as { code: string }[];
    expect(left.map((l) => l.code)).toEqual(['ROBI']);
    await expect(page.getByRole('button', { name: 'Move 1 into my trades' })).toBeVisible();
  });
  test.use({ allowedConsole: [/status of 503/] });
});

test.describe('dashboard: My holdings today (API mocked)', () => {
  test('shows value, check badges and a changed marker; links to /portfolio', async ({ page }) => {
    await page.addInitScript((k) => {
      localStorage.setItem('tradesKey', k);
      localStorage.setItem('holdingChecks', JSON.stringify({ date: '2026-11-19', labels: { GP: 'Hold' } }));
    }, KEY);
    await page.route('**/api/trades', (r) => json(r, 200, LIST));
    await page.route('**/api/plans', (r) => json(r, 200, { plans: [], badRows: [] }));
    await page.goto('/');
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'My holdings today' }) });
    await expect(card).toContainText('৳16,800.00');
    await expect(card.locator('.pill.s-caution')).toHaveText('Above your target');
    await expect(card.getByText('Changed since last visit')).toHaveAttribute('title', 'Was: Hold');
    await expect(card.getByRole('link', { name: 'Open portfolio →' })).toHaveAttribute('href', '/portfolio');
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('holdingChecks')))!).labels).toEqual({ GP: 'Above your target' });
  });

  test('hidden with nothing saved, and hidden on a 401', async ({ page }) => {
    await page.route('**/api/trades', (r) => json(r, 401, { error: 'Wrong trades key.' }));
    await page.route('**/api/plans', (r) => json(r, 401, { error: 'Wrong trades key.' }));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My holdings today' })).toHaveCount(0);
    await page.evaluate((k) => localStorage.setItem('tradesKey', k), KEY);
    const req = page.waitForResponse((r) => r.url().endsWith('/api/trades'));
    await page.reload();
    await req;
    await expect(page.getByRole('heading', { name: 'My holdings today' })).toHaveCount(0);
  });
  test.use({ allowedConsole: [/status of 401/] });
});

test.describe('telegram for every user (session and Telegram API mocked)', () => {
  test('signed in: Connect shows the bot link and a QR code, then turns to Connected after Start', async ({ page }) => {
    let connected = false;
    await page.route('**/api/auth/session', (r) => json(r, 200, { user: { name: 'Demo' }, expires: '2099-01-01T00:00:00Z', sheetUrl: 'https://docs.google.com/spreadsheets/d/1DemoSheetId000000/edit' }));
    await page.route('**/api/trades**', (r) => json(r, 200, { account: 'real', trades: [], holdings: [], warnings: [], badRows: [] }));
    await page.route('**/api/telegram/status', (r) => json(r, 200, { connected }));
    await page.route('**/api/telegram/link', (r) => (r.request().method() === 'POST'
      ? json(r, 200, { url: 'https://t.me/DseTestBot?start=k7Qm2xV9aB3dE5fGhJ1q0w', expiresAt: new Date(Date.now() + 600_000).toISOString() })
      : json(r, 200, { disconnected: true })));
    await page.goto('/portfolio');
    await openSettings(page);
    await page.getByRole('button', { name: 'Connect Telegram' }).click();
    await expect(page.getByRole('link', { name: 'Open Telegram (opens in a new tab)' })).toHaveAttribute('href', 'https://t.me/DseTestBot?start=k7Qm2xV9aB3dE5fGhJ1q0w');
    await expect(page.locator('.tg-connect svg title')).toHaveText('Scan to connect Telegram');
    connected = true;
    await expect(page.getByText('Connected ✓', { exact: false })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Disconnect Telegram' }).click();
    await expect(page.getByRole('button', { name: 'Connect Telegram' })).toBeVisible();
  });
});

