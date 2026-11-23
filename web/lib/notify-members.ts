import { checkOnce, type NotifyState } from './notify.ts';
import { SIGN_IN_AGAIN, userTarget } from './google-user.ts';
import { SheetsError, withSheet } from './sheets.ts';
import { sendMessage } from './telegram.ts';
import { connectedMembers, refreshTokenOf, saveMemberState, type Member } from './telegram-registry.ts';

const SITE = process.env.SITE_URL ?? 'https://dse-trade-helper.vercel.app';
const ASK_SIGN_IN = `Your Google sign-in for Trade Helper has ended, so alerts are paused. Sign in with Google again at ${SITE}/portfolio and alerts resume by themselves.`;

export interface MembersResult { users: number; sent: number; failed: number }

// One alert check per connected user, each on their own Sheet and chat. One user's failure never stops the next.
export async function runMembers(now = new Date()): Promise<MembersResult> {
  const list = await connectedMembers();
  const result: MembersResult = { users: list.length, sent: 0, failed: 0 };
  for (const m of list) {
    const state = await checkMember(m, now).catch((e: unknown) => {
      result.failed++;
      return failedState(m, e, now).catch((e2: unknown) => { console.error(`notify: failure handling failed for registry row ${m.row}`, e2); return { next: m.state, sentNow: 0 }; });
    });
    result.sent += state.sentNow;
    await saveMemberState(m, state.next).catch((e: unknown) => console.error(`notify: could not save alert state for registry row ${m.row}`, e));
  }
  return result;
}

async function checkMember(m: Member, now: Date): Promise<{ next: NotifyState; sentNow: number }> {
  const target = userTarget({ sub: m.googleId, sheetId: m.sheetId, refreshToken: refreshTokenOf(m) });
  const r = await withSheet(target, () => checkOnce(m.state, (text) => sendMessage(text, fetch, m.chatId), now));
  // A working run clears the "sign in again" note, so a later lapse is told again.
  return { next: { ...r.state, signInAsked: undefined }, sentNow: r.sent };
}

async function failedState(m: Member, e: unknown, now: Date): Promise<{ next: NotifyState; sentNow: number }> {
  const at = now.toISOString();
  if (e instanceof SheetsError && e.message === SIGN_IN_AGAIN) {
    // Told once per lapse, not every 15 minutes.
    if (!m.state.signInAsked) await sendMessage(ASK_SIGN_IN, fetch, m.chatId);
    console.warn(`notify: Google sign-in ended for registry row ${m.row}; alerts paused until the user signs in again`);
    return { next: { ...m.state, signInAsked: at, lastError: { at, text: 'Google sign-in ended. Sign in again to resume alerts.' } }, sentNow: 0 };
  }
  console.error(`notify: alert check failed for registry row ${m.row}`, e);
  const failed = (e as { state?: NotifyState }).state;
  return { next: failed ?? { ...m.state, lastError: { at, text: 'The alert check failed. The next check tries again.' } }, sentNow: 0 };
}
