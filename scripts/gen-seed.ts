// Regenerate a fresh appdata.json from the canonical seed.
// Usage: npx tsx scripts/gen-seed.ts [outfile]   (default: data/appdata.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { seedData } from '../lib/repository/seed';

const out = process.argv[2] ?? 'data/appdata.json';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(seedData(), null, 2));
console.log(`Wrote ${out}`);
