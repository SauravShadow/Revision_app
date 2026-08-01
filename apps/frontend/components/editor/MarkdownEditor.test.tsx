import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MarkdownEditor } from './MarkdownEditor';

// Only .matches is read by the component; the rest of the MediaQueryList
// surface is unused.
const stubViewport = (mobile: boolean) =>
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile })));

describe('MarkdownEditor default mode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to split on desktop (textarea and preview both render)', () => {
    stubViewport(false);
    render(<MarkdownEditor value="hello" onChange={() => {}} topicId="t1" />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    // Both textarea and preview carry the text in split mode.
    expect(screen.getAllByText('hello').length).toBeGreaterThanOrEqual(2);
  });

  it('defaults to preview on phones (no textarea)', () => {
    stubViewport(true);
    render(<MarkdownEditor value="hello" onChange={() => {}} topicId="t1" />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('prefers a stored mode over the phone default', () => {
    stubViewport(true);
    localStorage.setItem('ce-editor-mode', 'edit');
    render(<MarkdownEditor value="hello" onChange={() => {}} topicId="t1" />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('persists an explicit mode choice', async () => {
    stubViewport(false);
    render(<MarkdownEditor value="hello" onChange={() => {}} topicId="t1" />);
    await userEvent.click(screen.getByRole('button', { name: 'preview' }));
    expect(localStorage.getItem('ce-editor-mode')).toBe('preview');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

it('toolbar buttons are real 44px targets on phones, not hit-area expanded', () => {
  render(<MarkdownEditor value="" onChange={() => {}} topicId="t1" />);
  const bold = screen.getByRole('button', { name: 'Bold' });
  // Dense cluster at ~35px pitch: expanded ::after boxes would overlap by ~9px
  // and steal each other's taps, so the drawn box grows instead.
  expect(bold.className).toContain('min-h-11');
  expect(bold.className).toContain('min-w-11');
});

it('the toolbar row scrolls horizontally instead of wrapping into the notes', () => {
  const { container } = render(<MarkdownEditor value="" onChange={() => {}} topicId="t1" />);
  const row = container.querySelector('[data-toolbar]');
  expect(row).not.toBeNull();
  expect(row!.className).toContain('overflow-x-auto');
});
