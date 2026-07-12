import type { NextRequest } from 'next/server';
import type { AppData } from '@/lib/domain/types';
import { readData, writeData } from '@/lib/repository/fileStore';

// Reads/writes a file on disk, so this route must never be statically cached.
export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await readData();
  return Response.json(data); // AppData | null
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as AppData;
  await writeData(body);
  return new Response(null, { status: 204 });
}
