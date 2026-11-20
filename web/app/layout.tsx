import type { Metadata } from 'next';
import { IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import { AppProvider } from '@/components/AppProvider';
import { LangProvider } from '@/components/i18n';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { AlertsWatcher } from '@/components/AlertsWatcher';
import './globals.css';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'DSE Trade Helper',
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
