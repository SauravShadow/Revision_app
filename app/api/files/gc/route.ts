import { readData } from '@/lib/repository/fileStore';
import { referencedBlobIds, sweepUnreferenced } from '@/lib/repository/gc';

export const dynamic = 'force-dynamic';

export async function POST() {
  const data = await readData();
  const result = await sweepUnreferenced(referencedBlobIds(data));
  return Response.json(result);
}
