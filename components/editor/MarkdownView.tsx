'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { getStoredFileToken } from '@/lib/auth/client';
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

function addTokenToUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('/api/')) {
    const token = getStoredFileToken();
    if (token) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}token=${encodeURIComponent(token)}`;
    }
  }
  return url;
}

export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className={PROSE}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkCallouts]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex, rehypeHighlight]}
        urlTransform={addTokenToUrl}
      >
        {markdown || '_Nothing yet._'}
      </ReactMarkdown>
    </div>
  );
}
