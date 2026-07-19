import { it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/client', () => ({ getStoredFileToken: () => 'file-tok' }));

import { addTokenToUrl } from './url';

it('appends the token to internal /api/ urls', () => {
  expect(addTokenToUrl('/api/files/a1')).toBe('/api/files/a1?token=file-tok');
});

it('uses & when the url already has a query string', () => {
  expect(addTokenToUrl('/api/files/a1?x=1')).toBe('/api/files/a1?x=1&token=file-tok');
});

it('leaves external urls untouched and returns empty for undefined', () => {
  expect(addTokenToUrl('https://example.com/x.png')).toBe('https://example.com/x.png');
  expect(addTokenToUrl(undefined)).toBe('');
});
