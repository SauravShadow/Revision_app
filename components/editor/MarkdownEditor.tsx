'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex gap-2 text-sm">
        <button onClick={() => setPreview(false)} className={`rounded px-3 py-1 ${!preview ? 'bg-white/15' : 'opacity-60'}`}>Edit</button>
        <button onClick={() => setPreview(true)} className={`rounded px-3 py-1 ${preview ? 'bg-white/15' : 'opacity-60'}`}>Preview</button>
      </div>
      {preview ? (
        <div className="space-y-2 text-sm leading-relaxed [&_a]:underline [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value || '_Nothing yet._'}</ReactMarkdown>
        </div>
      ) : (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={16}
          placeholder="Write markdown notes…"
          className="w-full resize-y bg-transparent text-sm outline-none" />
      )}
    </div>
  );
}
