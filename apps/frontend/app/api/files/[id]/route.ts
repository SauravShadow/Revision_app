import { proxyRequest } from '@/lib/serviceProxy';

const FILES_SERVICE_URL = process.env.FILES_SERVICE_URL ?? 'http://127.0.0.1:4003';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `${FILES_SERVICE_URL}/${id}`);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `${FILES_SERVICE_URL}/${id}`);
}
