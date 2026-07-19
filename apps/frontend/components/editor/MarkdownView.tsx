'use client';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import type { Attachment } from '@revision-app/shared';
import { addTokenToUrl } from '@/lib/files/url';
import { usePreview } from '@/components/preview/PreviewContext';
import { PdfThumbnail } from '@/components/preview/PdfThumbnail';
import { remarkCallouts } from './remarkCallouts';

// Allow the elements/attributes our features emit, while still stripping scripts etc.
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style'],
    input: ['type', 'checked', 'disabled'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className', 'style'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    div: [...(defaultSchema.attributes?.div ?? []), 'className'],
  },
};

const PROSE =
  'space-y-3 text-sm leading-relaxed break-words ' +
  '[&_a]:underline [&_a]:text-sky-400 ' +
  '[&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_pre]:rounded-lg [&_pre]:bg-black/40 [&_pre]:p-3 [&_pre]:overflow-x-auto ' +
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-white/10 [&_:not(pre)>code]:px-1 ' +
  '[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:border-white/15 [&_td]:border-white/15 [&_th]:p-1.5 [&_td]:p-1.5 ' +
  '[&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:opacity-80 ' +
  '[&_img]:max-w-full [&_img]:rounded-lg';

function findPdfAttachment(href: string, attachments?: Attachment[]): Attachment | undefined {
  if (!href || !attachments) return undefined;
  const base = href.split('?')[0];
  return attachments.find((a) => a.kind === 'pdf' && a.url === base);
}

export function MarkdownView({ markdown, attachments }: { markdown: string; attachments?: Attachment[] }) {
  const { openPreview } = usePreview();

  let previewComponents: Components | undefined;
  if (openPreview) {
    const open = openPreview; // narrowed non-null
    previewComponents = {
      img: ({ src, alt }) => {
        const url = typeof src === 'string' ? src : '';
        return (
          <button type="button" onClick={() => open({ url, name: alt ?? '', kind: 'image' })} className="block cursor-zoom-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={alt ?? ''} className="max-w-full rounded-lg" />
          </button>
        );
      },
      a: ({ href, children }) => {
        const url = typeof href === 'string' ? href : '';
        const pdf = findPdfAttachment(url, attachments);
        if (pdf) {
          return (
            <button type="button" onClick={() => open({ url, name: pdf.name, kind: 'pdf' })} className="my-2 block w-40 cursor-zoom-in text-left">
              <PdfThumbnail url={url} className="h-28 w-full rounded-md object-cover" />
              <span className="mt-1 block truncate text-xs opacity-70">{pdf.name}</span>
            </button>
          );
        }
        return <a href={url} target="_blank" rel="noreferrer">{children}</a>;
      },
    };
  }

  return (
    <div className={PROSE}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkCallouts]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex, rehypeHighlight]}
        urlTransform={addTokenToUrl}
        components={previewComponents}
      >
        {markdown || '_Nothing yet._'}
      </ReactMarkdown>
    </div>
  );
}
