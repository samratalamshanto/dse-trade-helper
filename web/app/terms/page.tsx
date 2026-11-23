import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of service' };

// Public terms; Google's OAuth consent screen links here.
export default function TermsPage() {
  return (
    <>
      <h1>Terms of service</h1>
      <p className="muted">These terms apply when you use Trade Helper. Last updated 23 November 2026.</p>
      <div className="panel">
        <h2 className="h3">Not investment advice</h2>
        <p>Trade Helper is a free learning aid. Signals, checks and plans come from fixed rules on public Dhaka Stock Exchange data. They are not advice to buy or sell. You make your own trading decisions, and you carry their risk.</p>
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        <h2 className="h3">Data can be wrong or late</h2>
        <p>Prices, financials and announcements come from the DSE public website (dse.com.bd). They can be delayed, missing or wrong. Check the company&apos;s own disclosures before you trade.</p>
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        <h2 className="h3">Your data</h2>
        <ul>
          <li>What you enter stays in your browser, or in the &quot;Trade Helper&quot; Sheet in your own Google Drive when you sign in with Google. You own it. See the <a href="/privacy">privacy policy</a>.</li>
          <li>Keep a copy of anything important. Use &quot;Export my data&quot; on the Portfolio page, or the Sheet itself.</li>
          <li>Your use of Google sign-in and Google Drive also follows Google&apos;s own terms.</li>
        </ul>
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        <h2 className="h3">No warranty</h2>
        <p>The service is given &quot;as is&quot;, with no warranty and no promise that it is always available or free of errors. We are not liable for losses from trades, data errors or service outages. We can change or stop the service, or change these terms; the date above shows the last change.</p>
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        <h2 className="h3">Fair use</h2>
        <p>Do not try to reach other people&apos;s data, overload the service, or use it for anything unlawful.</p>
      </div>
      <p className="muted" style={{ marginTop: 14 }}>Questions: write to the support email shown on the Google sign-in screen.</p>
    </>
  );
}
