'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLang } from '@/components/i18n';

const WIDTH = 280, GAP = 8, HOVER_CLOSE_MS = 150;

// A pill that opens a short "why" box on tap, click, keyboard or mouse hover. Rows that navigate on click do not see these clicks.
export function PillPopover({ className, style, pill, meaning, title = '', items = [], href }: {
  className: string; style?: CSSProperties; pill: ReactNode; meaning: string; title?: string; items?: readonly string[]; href?: string;
}) {
  const { t } = useLang();
  const id = useId();
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Opened by hover: a click then keeps it open instead of closing it, and leaving no longer closes it.
  const byHover = useRef(false);

  // Fixed position, so a table that scrolls sideways does not clip the box.
  const open = () => {
    clearTimeout(timer.current);
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.max(GAP, Math.min(r.left, window.innerWidth - WIDTH - GAP)) });
  };
  const close = () => { byHover.current = false; setPos(null); };

  useEffect(() => {
    if (!pos) return;
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span ref={box} className="pill-pop" onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape' && pos) { e.stopPropagation(); close(); btn.current?.focus(); } }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !pos) { byHover.current = true; open(); } else clearTimeout(timer.current); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse' && byHover.current) timer.current = setTimeout(close, HOVER_CLOSE_MS); }}>
      <button ref={btn} type="button" className={className} style={style} aria-expanded={!!pos} aria-controls={id}
        onClick={() => { if (pos && !byHover.current) close(); else { byHover.current = false; open(); } }}>{pill}</button>
      {pos ? (
        <span id={id} className="pop-box" style={{ ...pos, width: WIDTH }}>
          <span className="pop-meaning">{t(meaning)}</span>
          {items.length ? <><b className="pop-title">{t(title)}</b><ul>{items.map((x) => <li key={x}>{t(x)}</li>)}</ul></> : null}
          {href ? <Link href={href}>{t('See details →')}</Link> : null}
        </span>
      ) : null}
    </span>
  );
}
