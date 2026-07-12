import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppData } from '@/lib/domain/types';
import { filesDir, deleteBlob, GC_GRACE_MS } from './fileBlobStore';

const UPLOAD_URL_RE = /^\/api\/files\/([A-Za-z0-9-]+)$/;

export function referencedBlobIds(data: AppData | null): Set<string> {
  const ids = new Set<string>();
  if (!data) return ids;
  for (const t of Object.values(data.topics)) {
    for (const a of t.attachments ?? []) {
      const m = a.url.match(UPLOAD_URL_RE);
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

// Delete blobs no longer referenced by any attachment. Blobs younger than
// the grace period are kept so in-session undo can still restore them.
export async function sweepUnreferenced(
  referenced: Set<string>,
  now = Date.now(),
): Promise<{ scanned: number; deleted: number }> {
  const dir = filesDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { scanned: 0, deleted: 0 };
  }
  const ids = entries.filter((e) => !e.endsWith('.json'));
  let deleted = 0;
  for (const id of ids) {
    if (referenced.has(id)) continue;
    try {
      const stat = await fs.stat(path.join(dir, id));
      if (now - stat.mtimeMs < GC_GRACE_MS) continue;
      await deleteBlob(id);
      deleted++;
    } catch {
      // Raced with another delete or unreadable entry — skip.
    }
  }
  return { scanned: ids.length, deleted };
}
