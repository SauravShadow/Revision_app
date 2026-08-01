'use client';
import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Heading, List, ListChecks, Code, Sigma, Quote, Link2, Image as ImageIcon, Table, Maximize2, Minimize2 } from 'lucide-react';
import { MarkdownView } from './MarkdownView';
import { wrapSelection, insertAt } from './insertMarkdown';
import { uploadFile } from '@/lib/files/uploadFile';
import { useStore } from '@/store/useStore';
import { IconButton } from '@/components/ui/IconButton';

type Mode = 'edit' | 'preview' | 'split';

const MODE_KEY = 'ce-editor-mode';
const isMode = (v: string | null): v is Mode => v === 'edit' || v === 'preview' || v === 'split';

export function MarkdownEditor({ value, onChange, topicId }: { value: string; onChange: (v: string) => void; topicId: string }) {
  const [mode, setModeState] = useState<Mode>('split');
  const [maximized, setMaximized] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const addAttachment = useStore((s) => s.addAttachment);
  const attachments = useStore((s) => s.topics[topicId]?.attachments);

  // Mobile is read-mostly and split stacks into textarea + duplicate preview
  // there, so phones default to preview; an explicit choice is remembered.
  // Effect (not state initializer) so SSR markup and hydration agree.
  useEffect(() => {
    const stored = localStorage.getItem(MODE_KEY);
    if (isMode(stored)) setModeState(stored);
    else if (window.matchMedia?.('(max-width: 767px)').matches) setModeState('preview');
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode — session-only */ }
  };

  useEffect(() => {
    if (!maximized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMaximized(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [maximized]);

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

  // 13 buttons at ~35px pitch: a 44px ::after hit box on each would overlap its
  // neighbours by ~9px and land taps on the wrong tool, so this cluster grows
  // for real on phones and the row scrolls rather than wrapping.
  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <IconButton label={title} onClick={onClick} size="regular"
      className="shrink-0 opacity-70 hover:bg-white/10 hover:opacity-100 active:bg-white/15 active:opacity-100 md:min-h-0 md:min-w-0 md:p-1.5">{children}</IconButton>
  );

  return (
    <div className={`${maximized ? 'fixed inset-3 z-50 flex flex-col rounded-xl border border-line-strong bg-ground-deep/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-md sm:inset-5' : 'glass rounded-xl p-3'}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div data-toolbar className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] md:flex-wrap md:overflow-x-visible">
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
        <div className="flex items-center gap-2">
          <div className="flex gap-1 text-xs">
            {(['edit', 'split', 'preview'] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`min-h-11 rounded px-3 capitalize md:min-h-0 md:px-2 md:py-1 ${mode === m ? 'bg-white/15' : 'opacity-60 hover:bg-white/10 hover:opacity-100 active:bg-white/10'}`}>{m}</button>
            ))}
          </div>
          <IconButton
            label={maximized ? 'Minimize editor' : 'Maximize editor'}
            onClick={() => setMaximized((current) => !current)}
            className="text-ink-dim hover:bg-white/10 hover:text-ink"
          >
            {maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </IconButton>
        </div>
      </div>
      <div className={`${maximized ? 'min-h-0 flex-1' : ''} ${mode === 'split' ? 'grid gap-3 md:grid-cols-2' : ''}`}>
        {mode !== 'preview' && (
          <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={18}
            placeholder="Write markdown… supports **bold**, tables, - [ ] tasks, ```code```, $math$, > [!note] callouts, <details>"
            className={`${maximized ? 'h-full min-h-0 resize-none' : 'resize-y'} w-full rounded-lg bg-black/20 p-3 font-mono text-sm outline-none`} />
        )}
        {mode !== 'edit' && (
          <div className={`${maximized ? 'h-full min-h-0' : 'max-h-[32rem]'} overflow-y-auto rounded-lg bg-black/10 p-3`}><MarkdownView markdown={value} attachments={attachments} /></div>
        )}
      </div>
    </div>
  );
}
