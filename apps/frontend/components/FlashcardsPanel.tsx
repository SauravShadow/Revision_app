'use client';
import { useState } from 'react';
import { Layers, Plus, Trash2, Play, X, Sparkles, Check } from 'lucide-react';
import type { Topic } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { getStoredToken } from '@/lib/auth/client';

interface ProposedCard {
  front: string;
  back: string;
  keep: boolean;
}

export function FlashcardsPanel({ topic }: { topic: Topic }) {
  const { addFlashcard, deleteFlashcard } = useStore.getState();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [review, setReview] = useState(false);
  const [proposed, setProposed] = useState<ProposedCard[]>([]);
  const [usageId, setUsageId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cards = topic.flashcards ?? [];

  const add = () => {
    if (!front.trim() || !back.trim()) return;
    addFlashcard(topic.id, front.trim(), back.trim());
    setFront(''); setBack('');
  };

  const generate = async () => {
    setBusy(true); setError(null); setProposed([]);
    try {
      const res = await fetch('/api/ai/flashcards', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${getStoredToken() ?? ''}` },
        body: JSON.stringify({ topicId: topic.id, title: topic.title, notes: topic.notes, count: 8 }),
      });
      const payload = (await res.json()) as { usageId?: number; cards?: { front: string; back: string }[]; error?: string };
      if (!res.ok) { setError(payload.error ?? 'Could not generate cards.'); return; }
      if (!payload.cards?.length) { setError('No cards could be made from these notes.'); return; }
      setUsageId(payload.usageId ?? null);
      setProposed(payload.cards.map((c) => ({ ...c, keep: true })));
    } catch {
      setError('Could not reach the AI service.');
    } finally {
      setBusy(false);
    }
  };

  const discardReview = () => { setProposed([]); setUsageId(null); };

  const saveKept = () => {
    const kept = proposed.filter((c) => c.keep);
    for (const c of kept) addFlashcard(topic.id, c.front, c.back, 'generated');
    if (usageId !== null) {
      // Quality signal only — must never block or fail the student's save.
      void fetch('/api/ai/flashcards/kept', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${getStoredToken() ?? ''}` },
        body: JSON.stringify({ usageId, kept: kept.length }),
      }).catch(() => {});
    }
    discardReview();
  };

  const keptCount = proposed.filter((c) => c.keep).length;

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Layers size={16} /><h3 className="font-semibold">Flashcards ({cards.length})</h3></div>
        <div className="flex items-center gap-2">
          <button
            onClick={generate}
            disabled={busy || !topic.notes.trim()}
            title={topic.notes.trim() ? 'Generate cards from this topic’s notes' : 'Add notes first'}
            className="flex min-h-11 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs hover:bg-white/5 disabled:opacity-40 md:min-h-0 md:px-2 md:py-1"
          >
            <Sparkles size={13} /> {busy ? 'Generating…' : 'Generate'}
          </button>
          {cards.length > 0 && (
            <button onClick={() => setReview(true)} className="flex min-h-11 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs hover:bg-white/5 md:min-h-0 md:px-2 md:py-1"><Play size={13} /> Review</button>
          )}
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}

      {proposed.length > 0 && (
        <div className="mb-3 rounded-lg border border-white/10 p-3">
          <p className="mb-2 text-xs text-white/60">Review before saving — uncheck anything wrong.</p>
          <ul className="flex flex-col gap-2">
            {proposed.map((c, i) => (
              <li key={i} className={`rounded-lg border p-2 text-sm ${c.keep ? 'border-white/15' : 'border-white/5 opacity-40'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{c.front}</p>
                    <p className="text-xs text-white/70">{c.back}</p>
                  </div>
                  <button
                    aria-label={`${c.keep ? 'Discard' : 'Keep'} ${c.front}`}
                    onClick={() => setProposed((p) => p.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))}
                    className="touch-target rounded p-1 hover:bg-white/10"
                  >
                    {c.keep ? <Check size={14} /> : <Plus size={14} />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              onClick={saveKept}
              disabled={keptCount === 0}
              className="min-h-11 flex-1 rounded-lg border border-white/15 text-sm hover:bg-white/5 disabled:opacity-40 md:min-h-0 md:py-2"
            >
              Save {keptCount} card{keptCount === 1 ? '' : 's'}
            </button>
            <button
              onClick={discardReview}
              className="min-h-11 rounded-lg border border-white/10 px-4 text-sm hover:bg-white/5 md:min-h-0 md:py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 grid gap-2">
        <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front (question)" className="min-h-11 rounded-lg bg-black/20 px-3 py-2 text-sm outline-none md:min-h-0" />
        <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back (answer)" className="min-h-11 rounded-lg bg-black/20 px-3 py-2 text-sm outline-none md:min-h-0" />
        <button onClick={add} className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 py-2 text-sm hover:border-white/30 md:min-h-0"><Plus size={14} /> Add card</button>
      </div>
      <ul className="space-y-2">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2 text-sm">
            <span className="min-w-0"><span className="truncate font-medium">{c.front}</span> <span className="opacity-50">— {c.back}</span></span>
            <button aria-label="Delete card" onClick={() => deleteFlashcard(topic.id, c.id)} className="touch-target rounded p-1 hover:bg-white/10"><Trash2 size={13} /></button>
          </li>
        ))}
      </ul>
      {review && <ReviewModal cards={cards} onClose={() => setReview(false)} />}
    </div>
  );
}

function ReviewModal({ cards, onClose }: { cards: { id: string; front: string; back: string }[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[i];
  const next = () => { setFlipped(false); setI((n) => (n + 1) % cards.length); };
  const prev = () => { setFlipped(false); setI((n) => (n - 1 + cards.length) % cards.length); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-lg rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between text-sm opacity-70">
          <span>Card {i + 1} / {cards.length}</span>
          <button aria-label="Close review" onClick={onClose}><X size={16} /></button>
        </div>
        <button onClick={() => setFlipped((f) => !f)} className="grid min-h-40 w-full place-items-center rounded-xl bg-white/5 p-6 text-center text-lg">
          {flipped ? card.back : card.front}
        </button>
        <div className="mt-2 text-center text-xs opacity-50">{flipped ? 'answer — click to flip' : 'question — click to reveal'}</div>
        <div className="mt-4 flex justify-between">
          <button onClick={prev} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Prev</button>
          <button onClick={next} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Next</button>
        </div>
      </div>
    </div>
  );
}
