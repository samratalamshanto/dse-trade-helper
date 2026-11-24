// Callback ref for a sideways-scrolling row: sets .fade-right while more items are hidden to the right, so CSS fades that edge.
export function scrollFade(el: HTMLElement | null) {
  if (!el) return;
  const update = () => { el.classList.toggle('fade-right', el.scrollLeft + el.clientWidth < el.scrollWidth - 1); };
  update();
  el.addEventListener('scroll', update, { passive: true });
  // Watch the children too: a language switch changes their width without resizing the row.
  const ro = new ResizeObserver(update);
  [el, ...el.children].forEach((c) => ro.observe(c));
  return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
}
