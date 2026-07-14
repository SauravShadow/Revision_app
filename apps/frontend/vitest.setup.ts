import 'dotenv/config';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Route all app code (which reads DATABASE_URL) at the test database when running under vitest,
// so tests never touch dev data.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// jsdom cannot fetch relative URLs, and the app-wide store persists to
// /api/data on every mutation. Default fetch to a 204 so component tests
// don't spray network errors; tests that care stub their own fetch.
vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
