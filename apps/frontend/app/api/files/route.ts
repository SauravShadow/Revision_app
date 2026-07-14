import { proxyRequest } from '@/lib/serviceProxy';

const FILES_SERVICE_URL = process.env.FILES_SERVICE_URL ?? 'http://127.0.0.1:4003';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return proxyRequest(req, `${FILES_SERVICE_URL}/upload`);
}
