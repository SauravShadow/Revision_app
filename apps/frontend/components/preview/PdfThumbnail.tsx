'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { loadPdfFirstPageToCanvas } from '@/lib/files/pdf';

export function PdfThumbnail({ url, className }: { url: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setReady(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    loadPdfFirstPageToCanvas(url, canvas)
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url]);

  if (failed) {
    return (
      <div className={`grid place-items-center bg-black/20 ${className ?? ''}`} aria-label="PDF">
        <FileText size={28} className="opacity-70" />
      </div>
    );
  }
  return (
    <canvas
      ref={canvasRef}
      aria-label="PDF preview"
      className={`${ready ? '' : 'opacity-0'} ${className ?? ''}`}
    />
  );
}
