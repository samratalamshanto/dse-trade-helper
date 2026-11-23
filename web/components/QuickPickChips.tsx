'use client';

import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { Icon, type IconName } from '@/components/ui';
import { QUICK_PICKS, type QuickPick, type QuickPickKey } from '@/lib/quick-picks';

const PICK_UI: Record<QuickPickKey, { icon: IconName; tone: string }> = {
  good: { icon: 'research', tone: 'accent' },
  cheap: { icon: 'tag', tone: 'accent' },
  dividend: { icon: 'coins', tone: 'up' },
  growth: { icon: 'trend', tone: 'up' },
  avoid: { icon: 'caution', tone: 'down' },
};

// The quick-pick chip row shared by /all and /range; pressing the active chip clears it (onPick(null)).
export function QuickPickChips({ active, onPick }: { active: QuickPickKey | null; onPick: (p: QuickPick | null) => void }) {
  const { t } = useLang();
  const current = QUICK_PICKS.find((p) => p.key === active);
  return (
    <>
      <div role="group" aria-label={t('Quick picks:')} className="presets">
        <span className="small muted"><Tr text="Quick picks:" /></span>
        {QUICK_PICKS.map((p) => {
          const ui = PICK_UI[p.key];
          return (
            <button key={p.key} type="button" className={`btn chip chip-${ui.tone}${active === p.key ? ' active' : ''}`} aria-pressed={active === p.key} title={t(p.hint)}
              onClick={() => onPick(active === p.key ? null : p)}><Icon name={ui.icon} /><Tr text={p.label} /></button>
          );
        })}
      </div>
      {current ? <p className="small muted preset-hint"><Tr text={current.label} />: {t(current.hint)}</p> : null}
    </>
  );
}
