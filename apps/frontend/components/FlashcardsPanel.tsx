'use client';
import { useState } from 'react';
import { Layers, Plus, Trash2, Play, X } from 'lucide-react';
import type { Topic } from '@revision-app/shared';
import { useStore } from '@/store/useStore';

export function FlashcardsPanel({ topic }: { topic: Topic }) {
  const { addFlashcard, deleteFlashcard } = useStore.getState();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [review, setReview] = useState(false);
  const cards = topic.flashcards ?? [];

  const add = () => {
    if (!front.trim() || !back.trim()) return;
    addFlashcard(topic.id, front.trim(), back.trim());
    setFront(''); setBack('');
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Layers size={16} /><h3 className="font-semibold">Flashcards ({cards.length})</h3></div>
        {cards.length > 0 && (
          <button onClick={() => setReview(true)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/5"><Play size={13} /> Review</button>
        )}
      </div>
      <div className="mb-3 grid gap-2">
        <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front (question)" className="rounded-lg bg-black/20 px-3 py-2 text-sm outline-none" />
        <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back (answer)" className="rounded-lg bg-black/20 px-3 py-2 text-sm outline-none" />
        <button onClick={add} className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 py-2 text-sm hover:border-white/30"><Plus size={14} /> Add card</button>
      </div>
      <ul className="space-y-2">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2 text-sm">
            <span className="min-w-0"><span className="truncate font-medium">{c.front}</span> <span className="opacity-50">— {c.back}</span></span>
            <button aria-label="Delete card" onClick={() => deleteFlashcard(topic.id, c.id)} className="rounded p-1 hover:bg-white/10"><Trash2 size={13} /></button>
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
