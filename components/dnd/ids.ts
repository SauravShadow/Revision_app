type DragType = 'subject' | 'chapter' | 'topic';
type NodeType = 'subject' | 'chapter';

export function dragId(type: DragType, id: string): string {
  return `${type}:${id}`;
}
export function nodeId(type: NodeType, id: string): string {
  return `${type}-node:${id}`;
}
export function parseId(raw: string): { kind: string; id: string } {
  const i = raw.indexOf(':');
  return { kind: raw.slice(0, i), id: raw.slice(i + 1) };
}
