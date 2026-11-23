import { existsSync } from 'node:fs';
import path from 'node:path';
import { HelpContent } from '@/components/HelpContent';

export const metadata = { title: 'Help and guides' };

const inPublic = (name: string) => existsSync(path.join(process.cwd(), 'public', name));

export default function HelpPage() {
  return <HelpContent files={{ video: inPublic('demo.mp4'), captions: inPublic('demo.vtt'), pdf: inPublic('user-guide.pdf') }} />;
}
