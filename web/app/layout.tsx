import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { AppProvider } from '@/components/AppProvider';
import { LangProvider } from '@/components/i18n';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { AlertsWatcher } from '@/components/AlertsWatcher';
import { PrefsSync } from '@/components/PrefsSync';
import { UserGuide } from '@/components/UserGuide';
import { Tr } from '@/components/Tr';
import './globals.css';

// Self-hosted (SIL OFL fonts) so pages never depend on a slow download from Google at build or dev time.
const sans = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/ibm-plex-sans-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
});
const mono = localFont({
  src: [
    { path: './fonts/jetbrains-mono-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/jetbrains-mono-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Trade Helper',
  description: 'Research Dhaka Stock Exchange companies: signals, warning signs, dividends and history from public DSE data.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <LangProvider>
        <AppProvider>
          <a className="skip-link" href="#view"><Tr text="Skip to content" /></a>
          <div className="layout">
            <Sidebar />
            <main>
              <Topbar />
              <div id="view" tabIndex={-1}>{children}</div>
              <footer>
                <Tr text="Signals are automatic rule results, not advice. Not affiliated with, or endorsed by, Dhaka Stock Exchange or BSEC. Not a licensed investment adviser." />
                {' '}<a href="/privacy"><Tr text="Privacy" /></a> · <a href="/terms"><Tr text="Terms" /></a>
              </footer>
            </main>
          </div>
          <AlertsWatcher />
          <PrefsSync />
          <UserGuide hasPdf={existsSync(path.join(process.cwd(), 'public', 'user-guide.pdf'))} />
        </AppProvider>
        </LangProvider>
      </body>
    </html>
  );
}
