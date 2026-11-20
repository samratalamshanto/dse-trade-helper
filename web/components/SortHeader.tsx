'use client';

import { Tr } from '@/components/Tr';

export interface SortState { key: string; dir: number }

// Sortable header with a real <button>, so keyboards and screen readers treat it as a control.
export function SortHeader({ k, label, sort, onSort, numeric = false }: { k: string; label: string; sort: SortState; onSort: (k: string) => void; numeric?: boolean }) {
  const ariaSort = sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none';
  return (
    <th className={numeric ? 'n' : undefined} data-sort={k} aria-sort={ariaSort}>
      <button type="button" className="sort-btn" onClick={() => onSort(k)}><Tr text={label} /></button>
    </th>
  );
}
