'use client';
import { useRef, useState } from 'react';
import { Bold, Italic, Heading, List, ListChecks, Code, Sigma, Quote, Link2, Image as ImageIcon, Table } from 'lucide-react';
import { MarkdownView } from './MarkdownView';
import { wrapSelection, insertAt } from './insertMarkdown';
import { uploadFile } from '@/lib/files/uploadFile';
import { useStore } from '@/store/useStore';

type Mode = 'edit' | 'preview' | 'split';

export function MarkdownEditor({ value, onChange, topicId }: { value: string; onChange: (v: string) => void; topicId: string }) {
  const [mode, setMode] = useState<Mode>('split');
  const ref = useRef<HTMLTextAreaElement>(null);
  const addAttachment = useStore((s) => s.addAttachment);

  const apply = (fn: (text: string, start: number, end: number) => { text: string; cursor: number }) => {
    const el = ref.current;
    if (!el) return;
    const { text, cursor } = fn(value, el.selectionStart, el.selectionEnd);
    onChange(text);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
  };

  const wrap = (m: string) => apply((t, s, e) => wrapSelection(t, s, e, m));
  const block = (snippet: string) => apply((t, _s, e) => insertAt(t, e, snippet));

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const att = await uploadFile(file);
        addAttachment(topicId, att);
        block(`\n![${att.name}](${att.url})\n`);
      } catch { window.alert('Image upload failed.'); }
    };
    input.click();
  };

  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button title={title} onClick={onClick} className="rounded p-1.5 opacity-70 hover:bg-white/10 hover:opacity-100">{children}</button>
  );

  return (
    <div className="glass rounded-xl p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-0.5">
          <Btn title="Bold" onClick={() => wrap('**')}><Bold size={15} /></Btn>
          <Btn title="Italic" onClick={() => wrap('*')}><Italic size={15} /></Btn>
          <Btn title="Heading" onClick={() => block('\n## Heading\n')}><Heading size={15} /></Btn>
          <Btn title="List" onClick={() => block('\n- item\n')}><List size={15} /></Btn>
          <Btn title="Checklist" onClick={() => block('\n- [ ] task\n')}><ListChecks size={15} /></Btn>
          <Btn title="Table" onClick={() => block('\n| A | B |\n| --- | --- |\n| 1 | 2 |\n')}><Table size={15} /></Btn>
          <Btn title="Code block" onClick={() => block('\n```\ncode\n```\n')}><Code size={15} /></Btn>
          <Btn title="Math" onClick={() => block('\n$$\ne^{i\\pi}+1=0\n$$\n')}><Sigma size={15} /></Btn>
          <Btn title="Callout" onClick={() => block('\n> [!note] Note text\n')}><Quote size={15} /></Btn>
          <Btn title="Link" onClick={() => block('[text](https://)')}><Link2 size={15} /></Btn>
          <Btn title="Image" onClick={pickImage}><ImageIcon size={15} /></Btn>
        </div>
        <div className="flex gap-1 text-xs">
          {(['edit', 'split', 'preview'] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-1 capitalize ${mode === m ? 'bg-white/15' : 'opacity-60'}`}>{m}</button>
          ))}
        </div>
      </div>
      <div className={mode === 'split' ? 'grid gap-3 md:grid-cols-2' : ''}>
        {mode !== 'preview' && (
          <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={18}
            placeholder="Write markdown… supports **bold**, tables, - [ ] tasks, ```code```, $math$, > [!note] callouts, <details>"
            className="w-full resize-y rounded-lg bg-black/20 p-3 font-mono text-sm outline-none" />
        )}
        {mode !== 'edit' && (
          <div className="max-h-[32rem] overflow-y-auto rounded-lg bg-black/10 p-3"><MarkdownView markdown={value} /></div>
        )}
      </div>
    </div>
  );
}
