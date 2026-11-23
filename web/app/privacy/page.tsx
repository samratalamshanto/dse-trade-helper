import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy' };

// Plain statement of what the app keeps; Google's OAuth consent screen links here.
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <p className="muted">Trade Helper is a learning aid for the Dhaka Stock Exchange. It is not investment advice. Last updated 23 November 2026.</p>
      <div className="panel">
        <h2 className="h3">Without signing in</h2>
        <p>Your trades, plans, limits and watchlist stay on this device only, in this browser. To value them, the page sends them to our server, which does the sums and keeps nothing.</p>
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        <h2 className="h3">With Google sign-in</h2>
        <ul>
          <li>Google gives us your name, email address and profile picture, and access to files this app makes in your Google Drive (the <code>drive.file</code> permission). We cannot see or open any other file in your Drive.</li>
          <li>The app makes one Google Sheet named &quot;Trade Helper&quot; in your Drive. Your trades, plans, limits, watchlist and alert rules are saved there. You own that Sheet, and the Portfolio page shows you a link to it.</li>
          <li>We keep no database of users. Your Google account id, the id of your Sheet and the Google access tokens are kept in an encrypted sign-in cookie in your browser. It ends after 7 days or when you sign out. To save time, the server also keeps the short-lived access token (valid at most one hour) in its memory, never on disk.</li>
          <li>Only if you tap &quot;Connect Telegram&quot;: we keep one row for you in the site owner&apos;s Google Sheet so the alert check can run while you are away. It holds your Google account id, your Sheet id, your Telegram chat id and your Google refresh token, encrypted. &quot;Disconnect Telegram&quot; deletes the row.</li>
          <li>We do not sell, share or show your data to anyone, and we use it only to run the features you use.</li>
        </ul>
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        <h2 className="h3">Remove your data</h2>
        <ul>
          <li>Sign out on the Portfolio page. This removes the sign-in cookie.</li>
          <li>Tap &quot;Disconnect Telegram&quot; on the Portfolio page. This deletes your row in the Telegram list.</li>
          <li>Remove the app&apos;s access at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</li>
          <li>Delete the &quot;Trade Helper&quot; Sheet in your Google Drive. We keep no copy.</li>
        </ul>
      </div>
      <p className="muted" style={{ marginTop: 14 }}>Questions: write to the support email shown on the Google sign-in screen.</p>
    </>
  );
}
