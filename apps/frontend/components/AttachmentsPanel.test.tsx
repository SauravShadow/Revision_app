import { it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttachmentsPanel } from './AttachmentsPanel';
import { useStore } from '@/store/useStore';
import { uploadFile } from '@/lib/files/uploadFile';
import type { Attachment, Topic } from '@/lib/domain/types';

vi.mock('@/lib/auth/client', () => ({ getStoredFileToken: () => 'file-tok' }));
vi.mock('@/lib/files/uploadFile', () => ({ uploadFile: vi.fn() }));

const uploadFileMock = vi.mocked(uploadFile);

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
  uploadFileMock.mockReset();
});

function createTopic(): Topic {
  const s = useStore.getState().addSubject('S');
  const c = useStore.getState().addChapter(s, 'C');
  const t = useStore.getState().addTopic(c, 'T');
  return useStore.getState().topics[t];
}

function topicWithAttachment(): Topic {
  const topic = createTopic();
  useStore.getState().addAttachment(topic.id, {
    id: 'a1', name: 'diagram.png', kind: 'image', url: '/api/files/a1', createdAt: 1,
  });
  return useStore.getState().topics[topic.id];
}

it('appends the stored file token to an internal attachment URL', () => {
  render(<AttachmentsPanel topic={topicWithAttachment()} />);
  const img = screen.getByAltText('diagram.png') as HTMLImageElement;
  expect(img.getAttribute('src')).toBe('/api/files/a1?token=file-tok');

  const link = screen.getByText('diagram.png').closest('a') as HTMLAnchorElement;
  expect(link.getAttribute('href')).toBe('/api/files/a1?token=file-tok');
});

it('adds uploaded images as attachments and returns markdown for notes insertion', async () => {
  const topic = createTopic();
  const onInsertMarkdown = vi.fn();
  const attachment: Attachment = {
    id: 'img1',
    name: 'beam [detail].png',
    kind: 'image',
    url: '/api/files/img1',
    createdAt: 1,
  };
  uploadFileMock.mockResolvedValueOnce(attachment);

  render(<AttachmentsPanel topic={topic} onInsertMarkdown={onInsertMarkdown} />);

  fireEvent.change(screen.getByLabelText(/upload image\/pdf/i), {
    target: { files: [new File(['image'], 'beam [detail].png', { type: 'image/png' })] },
  });

  await waitFor(() => expect(onInsertMarkdown).toHaveBeenCalledWith('![beam \\[detail\\].png](/api/files/img1)'));
  expect(useStore.getState().topics[topic.id].attachments).toEqual([attachment]);
});
