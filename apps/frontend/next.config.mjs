/** @type {import('next').NextConfig} */

// Baseline security headers applied to every response. Deliberately conservative:
// no `script-src`/`style-src` restriction (Next's inline bootstrap needs nonces
// for that, which isn't wired up here), but we lock down the vectors that don't
// need one — clickjacking, MIME sniffing, plugin/object content, <base> hijack,
// and referrer/permissions leakage. Uploaded blobs get their own stricter CSP
// in files-service; this covers the app shell.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // HSTS is a no-op over plain HTTP, so it's safe to always send; it only
  // takes effect once the app is reached over HTTPS (e.g. behind the tunnel).
  { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  },
];

const nextConfig = {
  transpilePackages: ['@revision-app/shared'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
