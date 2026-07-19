import { getStoredFileToken } from '@/lib/auth/client';

/** Appends the stored file-access token to internal (/api/...) URLs. External URLs pass through unchanged. */
export function addTokenToUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('/api/')) {
    const token = getStoredFileToken();
    if (token) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}token=${encodeURIComponent(token)}`;
    }
  }
  return url;
}
