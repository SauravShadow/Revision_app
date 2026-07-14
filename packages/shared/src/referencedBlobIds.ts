import type { AppData } from './types';

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
