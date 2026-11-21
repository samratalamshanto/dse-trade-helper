import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { AppProvider } from '@/components/AppProvider';
import { LangProvider } from '@/components/i18n';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { AlertsWatcher } from '@/components/AlertsWatcher';
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
  description: 'Research Dhaka Stock Exchange companies: signals, fraud checks, dividends and history from public DSE data.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <LangProvider>
        <AppProvider>
          <a className="skip-link" href="#view">Skip to content</a>
          <div className="layout">
            <Sidebar />
            <main>
              <Topbar />
              <div id="view" tabIndex={-1}>{children}</div>
              <footer>
                Data: Dhaka Stock Exchange public website (dse.com.bd). Signals come from fixed rules on that data.
                They are learning aids, not investment advice. A red flag shows a pattern, not proof of fraud.
              </footer>
            </main>
          </div>
          <AlertsWatcher />
        </AppProvider>
        </LangProvider>
      </body>
    </html>
  );
}
