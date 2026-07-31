'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';

// One modal surface for the whole app: a bottom sheet on phones (thumb
// reachable, safe-area padded, grab handle) and a centred dialog from sm up.
// Handles the scroll lock and Escape wiring every caller used to repeat.
export function Sheet({
  label,
  onClose,
  children,
  className = '',
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  // Portalled to <body> so no transformed or backdrop-filtered ancestor can
  // become the containing block and shrink this to a fragment of the screen.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={reduceMotion ? false : { y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className={`glass max-h-[85svh] w-full overflow-y-auto rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-xl sm:pb-4 ${className}`}
      >
        {/* Grab handle — reads as "drag me down", phones only. */}
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong sm:hidden" />
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}
