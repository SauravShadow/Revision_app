import { defineConfig } from 'vitest/config';

// Plain Node environment — this package has no jsdom/React surface, unlike
// apps/frontend's vitest.config.ts (which adds the React plugin + jsdom for
// component tests). packages/shared only needs Node's runtime (crypto, etc.)
// for session.test.ts and referencedBlobIds.test.ts.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
