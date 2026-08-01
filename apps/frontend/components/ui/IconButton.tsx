'use client';
import { forwardRef } from 'react';

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> {
  /**
   * Accessible name. Required on purpose: an icon-only button without one is
   * unusable with a screen reader, and every sub-44px control the mobile audit
   * found was hand-rolled. Sets both aria-label and the native tooltip.
   */
  label: string;
  /**
   * 'compact' keeps the drawn box at its dense drafting size and floors only
   * the hit area (via .touch-target). 'regular' also floors the drawn box —
   * use it where the control is isolated and reads better bigger.
   */
  size?: 'compact' | 'regular';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, size = 'compact', className = '', children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={`touch-target grid place-items-center rounded-md transition ${
          size === 'regular' ? 'min-h-11 min-w-11 p-2.5' : 'p-1.5'
        } ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
