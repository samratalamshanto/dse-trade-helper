import { redirect } from 'next/navigation';

// The old address keeps working, including its ?lane=z tab.
export default async function FraudPage({ searchParams }: { searchParams: Promise<{ lane?: string }> }) {
  const { lane } = await searchParams;
  redirect(lane === 'z' ? '/warning-signs?lane=z' : '/warning-signs');
}
