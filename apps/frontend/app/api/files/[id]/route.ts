import { proxyRequest } from '@/lib/serviceProxy';

const FILES_SERVICE_URL = process.env.FILES_SERVICE_URL ?? 'http://127.0.0.1:4003';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Preserve the query string — file reads authenticate via a `?token=` param
  // (used by <img>/<iframe> subresource loads, which carry no Authorization
  // header). Dropping it here makes every non-fetch file load 401.
  const search = new URL(req.url).search;
  return proxyRequest(req, `${FILES_SERVICE_URL}/${id}${search}`);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const search = new URL(req.url).search;
  return proxyRequest(req, `${FILES_SERVICE_URL}/${id}${search}`);
}
