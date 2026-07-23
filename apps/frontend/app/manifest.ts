import type { MetadataRoute } from 'next';

// Web App Manifest — served at /manifest.webmanifest and auto-linked by Next.
// Feeds both browser "Add to Home Screen" and the Play Store TWA (see
// docs/superpowers/specs/2026-07-19-mobile-app-twa-design.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RevisionWorks',
    short_name: 'RevisionWorks',
    description: "Track your exam revision — spaced repetition that tells you what's due next.",
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#faf7ef',
    theme_color: '#4a7a1f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
