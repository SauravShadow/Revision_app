import { proxyRequest } from '@/lib/serviceProxy';

const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL ?? 'http://127.0.0.1:4002';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { search } = new URL(req.url);
  return proxyRequest(req, `${CONTENT_SERVICE_URL}/cohort/groups/${id}/students${search}`);
}
