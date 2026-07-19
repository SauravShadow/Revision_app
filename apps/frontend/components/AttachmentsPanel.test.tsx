import { it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttachmentsPanel } from './AttachmentsPanel';
import { useStore } from '@/store/useStore';
import { uploadFile } from '@/lib/files/uploadFile';
import { PreviewProvider } from '@/components/preview/PreviewContext';
import type { Attachment, Topic } from '@revision-app/shared';

vi.mock('@/lib/auth/client', () => ({ getStoredFileToken: () => 'file-tok' }));
vi.mock('@/lib/files/uploadFile', () => ({ uploadFile: vi.fn() }));
vi.mock('@/lib/files/pdf', () => ({ loadPdfFirstPageToCanvas: vi.fn().mockRejectedValue(new Error('no-op')) }));

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

function renderPanel(topic: Topic, onInsert?: (m: string) => void) {
  return render(
    <PreviewProvider>
      <AttachmentsPanel topic={topic} onInsertMarkdown={onInsert} />
    </PreviewProvider>,
  );
}

it('previews an image in-app instead of opening a new tab', () => {
  renderPanel(topicWithAttachment());
  const img = screen.getByAltText('diagram.png') as HTMLImageElement;
  expect(img.getAttribute('src')).toBe('/api/files/a1?token=file-tok');
  expect(img.closest('a')).toBeNull(); // no tab-out anchor for images

  fireEvent.click(img);
  // the modal renders a second copy of the same image
  expect(screen.getAllByAltText('diagram.png').length).toBeGreaterThan(1);
});

it('auto-inserts an uploaded PDF into the note as a link', async () => {
  const onInsert = vi.fn();
  uploadFileMock.mockResolvedValueOnce({
    id: 'p9', name: 'notes.pdf', kind: 'pdf', url: '/api/files/p9', createdAt: 1,
  });
  renderPanel(createTopic(), onInsert);

  fireEvent.change(screen.getByLabelText(/upload image\/pdf/i), {
    target: { files: [new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' })] },
  });

  await waitFor(() => expect(onInsert).toHaveBeenCalledWith('[notes.pdf](/api/files/p9)'));
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
