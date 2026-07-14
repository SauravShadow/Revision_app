import { promises as fs } from 'node:fs';
import path from 'node:path';
import { filesDir, deleteBlob, GC_GRACE_MS } from './fileBlobStore';

// Delete blobs no longer referenced by any attachment. Blobs younger than
// the grace period are kept so in-session undo can still restore them.
export async function sweepUnreferenced(
  referenced: Set<string>,
  now = Date.now(),
  userId?: string,
): Promise<{ scanned: number; deleted: number }> {
  const dir = filesDir(userId);
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
      await deleteBlob(id, userId);
      deleted++;
    } catch {
      // Raced with another delete or unreadable entry — skip.
    }
  }
  return { scanned: ids.length, deleted };
}
