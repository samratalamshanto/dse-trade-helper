'use client';

import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { Icon, type IconName } from '@/components/ui';
import { scrollFade } from '@/components/scroll-fade';
import { QUICK_PICKS, type QuickPick, type QuickPickKey } from '@/lib/quick-picks';

const PICK_UI: Record<QuickPickKey, { icon: IconName; tone: string }> = {
  good: { icon: 'research', tone: 'accent' },
  cheap: { icon: 'tag', tone: 'accent' },
  dividend: { icon: 'coins', tone: 'up' },
  growth: { icon: 'trend', tone: 'up' },
  avoid: { icon: 'caution', tone: 'down' },
};

// The quick-pick chip row shared by /all and /range. onPick gets the pressed chip and whether it was already on;
// both pages combine the chosen chips (a company must pass all of them).
export function QuickPickChips({ active, onPick }: { active: readonly QuickPickKey[]; onPick: (p: QuickPick, wasOn: boolean) => void }) {
  const { t } = useLang();
  const current = QUICK_PICKS.filter((p) => active.includes(p.key));
  return (
    <>
      <div role="group" aria-label={t('Quick picks:')} className="presets" ref={scrollFade}>
        <span className="small muted"><Tr text="Quick picks:" /></span>
        {QUICK_PICKS.map((p) => {
          const ui = PICK_UI[p.key];
          const on = active.includes(p.key);
          return (
            <button key={p.key} type="button" className={`btn chip chip-${ui.tone}${on ? ' active' : ''}`} aria-pressed={on} title={t(p.hint)}
              onClick={() => onPick(p, on)}><Icon name={ui.icon} /><Tr text={p.label} /></button>
          );
        })}
      </div>
      {current.map((p) => <p key={p.key} className="small muted preset-hint"><Tr text={p.label} />: {t(p.hint)}</p>)}
    </>
  );
}
