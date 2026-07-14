// apps/frontend/lib/serviceProxy.ts
// Forwards a request to a backend service unchanged (method, headers, body)
// and relays its response unchanged (status, body). No session logic here —
// each backend service verifies its own bearer token. A 5s timeout and a
// clean 502/503 on failure keep one backend's outage from hanging the
// browser or taking down unrelated routes (e.g. files-service being down
// must not block login).
export const PROXY_TIMEOUT_MS = 5000;

export async function proxyRequest(req: Request, targetUrl: string): Promise<Response> {
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('content-length');

  const init: RequestInit = {
    method: req.method,
    headers,
    // GET/HEAD must not carry a body.
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  };

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return Response.json(
      { error: timedOut ? 'Upstream service timed out' : 'Upstream service unavailable' },
      { status: timedOut ? 504 : 502 },
    );
  }
  const body = await upstream.arrayBuffer();
  const resHeaders = new Headers(upstream.headers);
  // Null-body statuses (204/205/304) must construct with a null body — the
  // Fetch spec throws a TypeError if a body (even an empty ArrayBuffer) is
  // passed alongside one of these statuses. logout returns 204, so this
  // isn't a hypothetical case.
  const isNullBodyStatus = [204, 205, 304].includes(upstream.status);
  return new Response(isNullBodyStatus ? null : body, { status: upstream.status, headers: resHeaders });
}
