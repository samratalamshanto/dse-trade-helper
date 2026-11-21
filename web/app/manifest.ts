import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trade Helper',
    short_name: 'Trade Helper',
    description: 'Research Dhaka Stock Exchange companies: signals, fraud checks, dividends and your watchlist.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d1117',
    theme_color: '#1f57c3',
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
