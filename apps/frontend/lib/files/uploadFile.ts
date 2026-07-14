import type { Attachment, AttachmentKind } from '@revision-app/shared';
import { authFetch } from '@/lib/auth/client';

export function mimeToKind(mime: string): AttachmentKind {
  return mime === 'application/pdf' ? 'pdf' : 'image';
}

export async function uploadFile(file: File): Promise<Attachment> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await authFetch('/api/files', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const data = (await res.json()) as { id: string; url: string; name: string; mime: string; size: number };
  return {
    id: data.id, name: data.name, kind: mimeToKind(data.mime),
    url: data.url, mime: data.mime, size: data.size, createdAt: Date.now(),
  };
}
