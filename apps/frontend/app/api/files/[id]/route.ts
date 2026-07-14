import { readBlob, deleteBlob, isValidBlobId } from '@/lib/repository/fileBlobStore';
import { getSessionFromRequest, getFileAccessUserId } from '@revision-app/shared/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = getFileAccessUserId(req);
  if (!userId) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!isValidBlobId(id)) return new Response(null, { status: 400 });
  const blob = await readBlob(id, userId);
  if (!blob) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      'Content-Type': blob.meta.mime,
      'Content-Disposition': `inline; filename="${blob.meta.name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!isValidBlobId(id)) return new Response(null, { status: 400 });
  await deleteBlob(id, session.userId);
  return new Response(null, { status: 204 });
}

