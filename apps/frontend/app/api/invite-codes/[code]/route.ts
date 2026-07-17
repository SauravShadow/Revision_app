import { proxyRequest } from '@/lib/serviceProxy';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4001';

export async function DELETE(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return proxyRequest(req, `${AUTH_SERVICE_URL}/invite-codes/${code}`);
}
