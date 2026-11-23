'use client';

import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { RangePage } from '@/components/range/RangePage';

export default function Range() {
  return <Suspense fallback={<Skeleton label="Loading 52-week range…" />}><RangePage /></Suspense>;
}
