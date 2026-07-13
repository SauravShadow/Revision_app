import type { NextRequest } from 'next/server';
import { makeId } from '@/lib/domain/id';
import { writeBlob } from '@/lib/repository/fileBlobStore';
import { getSessionFromRequest } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const MAX_UPLOAD = 25 * 1024 * 1024;
const ALLOWED = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf',
]);

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const form = await req.formData();
  const entry = form.get('file');
  // A text field is a string; a file is not. (Avoids referencing a global File.)
  if (!entry || typeof entry === 'string') {
    return Response.json({ error: 'no file' }, { status: 400 });
  }
  const mime = entry.type;
  if (!ALLOWED.has(mime)) return Response.json({ error: 'unsupported type' }, { status: 400 });
  if (entry.size > MAX_UPLOAD) return Response.json({ error: 'too large' }, { status: 400 });

  const id = makeId();
  const bytes = Buffer.from(await entry.arrayBuffer());
  const name = entry.name || id;
  await writeBlob(id, bytes, { name, mime, size: entry.size }, session.userId);
  return Response.json({ id, url: `/api/files/${id}`, name, mime, size: entry.size });
}

