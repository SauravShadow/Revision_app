import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    // Several test files share one external Postgres test database and
    // TRUNCATE its tables in beforeEach (lib/db/schema.test.ts,
    // lib/auth/userStore.test.ts, app/api/auth/login/route.test.ts,
    // app/api/auth/register/route.test.ts). Vitest's default file
    // parallelism runs files concurrently across workers, so one file's
    // TRUNCATE can wipe rows another file's in-flight test depends on
    // mid-assertion. Disabling file parallelism serializes ALL test files,
    // eliminating that cross-file race without weakening any assertions.
    //
    // A more narrowly-scoped fix was tried first: splitting the four
    // Postgres-touching files into their own `test.projects` entry with
    // fileParallelism: false while leaving every other file in a separate,
    // still-parallel project. That did NOT reliably serialize the four
    // files against each other (the cross-file race reproduced on the 2nd
    // of 3 attempts), so it was abandoned in favor of this global,
    // verified-safe setting. See task-3-report.md "Fix Round 1" for the
    // repro evidence and the resulting suite-duration tradeoff.
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
