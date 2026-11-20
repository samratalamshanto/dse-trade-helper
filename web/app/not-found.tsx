import Link from 'next/link';
import { Tr } from '@/components/Tr';

export default function NotFound() {
  return (
    <div className="panel empty-state">
      <p><b><Tr text="Page not found." /></b></p>
      <p className="muted"><Tr text="Check the trade code or the address, or go back to the" /> <Link href="/"><Tr text="dashboard" /></Link>.</p>
    </div>
  );
}
