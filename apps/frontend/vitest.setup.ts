import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom cannot fetch relative URLs, and the app-wide store persists to
// /api/data on every mutation. Default fetch to a 204 so component tests
// don't spray network errors; tests that care stub their own fetch.
vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
