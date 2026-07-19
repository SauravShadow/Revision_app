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

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        aria-label="PDF preview"
        className={`h-full w-full object-cover ${ready && !failed ? '' : 'opacity-0'}`}
      />
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-black/20" aria-label="PDF">
          <FileText size={28} className="opacity-70" />
        </div>
      )}
    </div>
  );
}
