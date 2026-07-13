'use client';
import { useState } from 'react';
import { Paperclip, Upload, Link as LinkIcon, FileText, Trash2, ExternalLink } from 'lucide-react';
import type { Topic } from '@/lib/domain/types';
import { useStore } from '@/store/useStore';
import { uploadFile } from '@/lib/files/uploadFile';
import { makeId } from '@/lib/domain/id';
import { getStoredFileToken } from '@/lib/auth/client';

function addTokenToUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('/api/')) {
    const token = getStoredFileToken();
    if (token) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}token=${encodeURIComponent(token)}`;
    }
  }
  return url;
}

export function AttachmentsPanel({ topic }: { topic: Topic }) {
  const { addAttachment, removeAttachment } = useStore.getState();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const attachments = topic.attachments ?? [];

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) addAttachment(topic.id, await uploadFile(f));
    } catch { window.alert('Upload failed.'); } finally { setBusy(false); }
  };

  const addLink = () => {
    const u = url.trim();
    if (!u) return;
    const kind = /youtube\.com|youtu\.be|vimeo\.com|\.mp4($|\?)/i.test(u) ? 'video' : 'link';
    addAttachment(topic.id, { id: makeId(), name: u, kind, url: u, createdAt: Date.now() });
    setUrl('');
  };

  const remove = (id: string) => removeAttachment(topic.id, id);

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2"><Paperclip size={16} /><h3 className="font-semibold">Attachments</h3></div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm hover:border-white/30">
          <Upload size={14} /> {busy ? 'Uploading…' : 'Upload image/PDF'}
          <input type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
            onChange={(e) => onUpload(e.target.files)} />
        </label>
      </div>
      <div className="mb-3 flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link or video URL"
          className="flex-1 rounded-lg bg-black/20 px-3 py-2 text-sm outline-none" onKeyDown={(e) => e.key === 'Enter' && addLink()} />
        <button onClick={addLink} className="rounded-lg border border-white/10 px-3 text-sm hover:bg-white/5"><LinkIcon size={14} /></button>
      </div>
      {attachments.length === 0 ? (
        <p className="text-sm opacity-50">No attachments yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2">
                <a href={addTokenToUrl(a.url)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm hover:underline">
                  {a.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={addTokenToUrl(a.url)} alt={a.name} className="h-10 w-10 rounded object-cover" />
                  ) : a.kind === 'pdf' ? <FileText size={18} /> : <ExternalLink size={16} />}
                  <span className="truncate">{a.name}</span>
                </a>
                <button aria-label="Remove attachment" onClick={() => remove(a.id)} className="rounded p-1 hover:bg-white/10"><Trash2 size={14} /></button>
              </li>
          ))}
        </ul>
      )}
    </div>
  );
}
