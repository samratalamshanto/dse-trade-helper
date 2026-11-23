import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from "next";

function turbopackRoot(): string {
  try {
    const nm = path.join(__dirname, 'node_modules');
    const realNm = fs.realpathSync(nm);
    const src = path.resolve(__dirname);
    const nmDir = path.dirname(realNm);
    if (nmDir === src) return src;
    const a = src.split(path.sep), b = nmDir.split(path.sep);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return a.slice(0, i).join(path.sep) || path.sep;
  } catch { return path.resolve(__dirname); }
}

const isDev = process.env.NODE_ENV === 'development';

// No third-party origins: fonts are self-hosted by next/font and every API call is same-origin.
// 'unsafe-inline' scripts: Next inlines its bootstrap scripts and this app uses no nonce; dev also needs eval for React debugging.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? ` http://127.0.0.1:${process.env.NEXT_PUBLIC_DEV_KEY_PORT ?? 3011}` : ''}`, // dev: lib/dev-key.ts
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  turbopack: { root: turbopackRoot() },
  // Dev only: lets http://127.0.0.1:3000 load page scripts (a cached Excalidraw worker owns localhost:3000 in the user's browser).
  allowedDevOrigins: ['127.0.0.1'],
  // The daily GitHub Action commits data/ (company cache, scorecard); Vercel's disk is read-only and starts empty.
  outputFileTracingIncludes: { '/*': ['./data/companies.json', './data/last-session.json', './data/scorecard/*.json'] },
  poweredByHeader: false,
  // My trades and the old browser-only Portfolio became one Portfolio page; old links and bookmarks still work.
  async redirects() {
    return [{ source: '/trades', destination: '/portfolio', permanent: false }];
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};

export default nextConfig;
