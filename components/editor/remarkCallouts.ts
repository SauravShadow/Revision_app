import { visit } from 'unist-util-visit';

// Turns a blockquote whose first line is `[!note] | [!tip] | [!warning] | [!danger]`
// into a <div class="callout callout-<type>">, stripping the marker.
export function remarkCallouts() {
  return (tree: unknown) => {
    visit(tree as never, 'blockquote', (node: {
      children: { type: string; children?: { type: string; value?: string }[]; data?: Record<string, unknown> }[];
      data?: Record<string, unknown>;
    }) => {
      const first = node.children[0];
      const firstText = first?.children?.[0];
      if (first?.type === 'paragraph' && firstText?.type === 'text' && typeof firstText.value === 'string') {
        const m = firstText.value.match(/^\[!(note|tip|warning|danger)\]\s?/i);
        if (m) {
          const type = m[1].toLowerCase();
          firstText.value = firstText.value.slice(m[0].length);
          node.data = node.data || {};
          (node.data as { hName?: string }).hName = 'div';
          (node.data as { hProperties?: unknown }).hProperties = { className: ['callout', `callout-${type}`] };
        }
      }
    });
  };
}
