import { it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewProvider, usePreview } from './PreviewContext';

function Trigger() {
  const { openPreview } = usePreview();
  return (
    <button onClick={() => openPreview?.({ url: '/api/files/i1?token=t', name: 'pic.png', kind: 'image' })}>
      open
    </button>
  );
}

it('opens and closes the modal through the context', () => {
  render(<PreviewProvider><Trigger /></PreviewProvider>);
  expect(screen.queryByAltText('pic.png')).toBeNull();
  fireEvent.click(screen.getByText('open'));
  expect(screen.getByAltText('pic.png')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Close preview'));
  expect(screen.queryByAltText('pic.png')).toBeNull();
});

it('exposes a null openPreview when no provider is present', () => {
  let captured: unknown = 'unset';
  function Probe() { captured = usePreview().openPreview; return null; }
  render(<Probe />);
  expect(captured).toBeNull();
});
