export function wrapSelection(text: string, start: number, end: number, marker: string): { text: string; cursor: number } {
  const before = text.slice(0, start);
  const sel = text.slice(start, end);
  const after = text.slice(end);
  const next = `${before}${marker}${sel}${marker}${after}`;
  const cursor = start + marker.length + sel.length;
  return { text: next, cursor };
}

export function insertAt(text: string, at: number, snippet: string): { text: string; cursor: number } {
  const next = text.slice(0, at) + snippet + text.slice(at);
  return { text: next, cursor: at + snippet.length };
}
