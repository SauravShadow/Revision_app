import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttachmentsPanel } from './AttachmentsPanel';
import { useStore } from '@/store/useStore';
import type { Topic } from '@/lib/domain/types';

vi.mock('@/lib/auth/client', () => ({ getStoredFileToken: () => 'file-tok' }));

beforeEach(() => useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] }));

function topicWithAttachment(): Topic {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  useStore.getState().addAttachment(t, {
    id: 'a1', name: 'diagram.png', kind: 'image', url: '/api/files/a1', createdAt: 1,
  });
  return useStore.getState().topics[t];
}

it('appends the stored file token to an internal attachment URL', () => {
  render(<AttachmentsPanel topic={topicWithAttachment()} />);
  const img = screen.getByAltText('diagram.png') as HTMLImageElement;
  expect(img.getAttribute('src')).toBe('/api/files/a1?token=file-tok');

  const link = screen.getByText('diagram.png').closest('a') as HTMLAnchorElement;
  expect(link.getAttribute('href')).toBe('/api/files/a1?token=file-tok');
});
