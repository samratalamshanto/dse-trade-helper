// Runs once per server start: the daily scorecard snapshot and the Telegram notifier (off without its secrets).
export async function register() {
  // Both modules use node:fs, so they load only in the Node.js runtime (Next docs: instrumentation, runtime-specific code).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [{ startScorecard }, { startNotifier }] = await Promise.all([import('./lib/scorecard-store'), import('./lib/notify')]);
  startScorecard();
  startNotifier();
  if (process.env.NODE_ENV === 'development') (await import('./lib/dev-key')).startDevKeyServer();
}
