import { readBlob, deleteBlob, isValidBlobId } from '@/lib/repository/fileBlobStore';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidBlobId(id)) return new Response(null, { status: 400 });
  const blob = await readBlob(id);
  if (!blob) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      'Content-Type': blob.meta.mime,
      'Content-Disposition': `inline; filename="${blob.meta.name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidBlobId(id)) return new Response(null, { status: 400 });
  await deleteBlob(id);
  return new Response(null, { status: 204 });
}
