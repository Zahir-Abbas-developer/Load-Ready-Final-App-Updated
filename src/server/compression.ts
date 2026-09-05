/**
 * Compressing what goes out.
 *
 * Measured in L3: the Node server was sending **384KB of JavaScript** where
 * gzip is 119KB, and 905KB in total for a first visit. On the rural connection
 * a pilot actually has, that is the difference between a load board that opens
 * and one they give up on.
 *
 * It is done here rather than in the build because the option that would have
 * done it at build time is not exposed by the Vite config wrapper this project
 * uses. Here also has an advantage: it covers the server-rendered HTML and the
 * API responses too, and it works on whatever host we end up on (F-87), rather
 * than depending on that host to do it.
 *
 * **`CompressionStream`, not `node:zlib`.** The same entry point builds a
 * Cloudflare Worker, where `node:zlib` does not exist — and the web API
 * streams rather than buffering, so a large export does not have to be held in
 * memory to be compressed.
 */

/**
 * What is worth compressing.
 *
 * Images, video, fonts and PDFs are already compressed; running them through
 * gzip spends processor time to make them very slightly larger.
 */
const COMPRESSIBLE =
  /^(?:text\/|application\/(?:json|javascript|xml|manifest\+json|x-ndjson)|image\/svg\+xml)/i;

/**
 * Below this, compression costs more than it saves.
 *
 * A gzip header is about 20 bytes and a round trip is not made faster by
 * shaving 200 of them.
 */
const MIN_BYTES = 1024;

/**
 * Whether this response should be compressed, and why not when it should not.
 *
 * Written as one function with the reasons in it because every one of these
 * exclusions is a bug if it is forgotten, and two of them are outages.
 */
function shouldCompress(response: Response, request: Request): boolean {
  // The client has to be willing.
  if (!/\bgzip\b/i.test(request.headers.get("accept-encoding") ?? "")) return false;

  // Already compressed by something upstream, or by us.
  if (response.headers.has("content-encoding")) return false;

  // No body to compress.
  if (!response.body) return false;
  if (response.status === 204 || response.status === 304) return false;

  const type = response.headers.get("content-type") ?? "";

  /*
   * **Never a stream of events.**
   *
   * Server-sent events are how the live trip, the chat and the notification
   * bell work. A compression stream buffers until it has something worth
   * emitting, so compressing one turns a live feed into a feed that arrives in
   * clumps minutes late — or not at all. This is the exclusion that would be
   * an outage rather than a slowdown.
   */
  if (type.includes("text/event-stream")) return false;

  if (!COMPRESSIBLE.test(type)) return false;

  /*
   * Small responses are left alone. `content-length` is absent on a streamed
   * body, and an unknown length is treated as worth compressing — those are
   * the large ones.
   */
  const length = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(length) && length > 0 && length < MIN_BYTES) return false;

  return true;
}

/**
 * Returns the response, compressed if that is the right thing to do.
 *
 * Never throws: a response that cannot be compressed is still a response, and
 * failing to compress must never fail the request.
 */
export function withCompression(response: Response, request: Request): Response {
  try {
    if (!shouldCompress(response, request)) return response;
    if (typeof CompressionStream === "undefined") return response;

    const headers = new Headers(response.headers);
    headers.set("content-encoding", "gzip");
    // The length is now wrong, and a wrong one is worse than none: a client
    // that believes it will read the body short.
    headers.delete("content-length");
    /*
     * Caches keyed on the URL alone would hand a compressed body to a client
     * that cannot read one.
     */
    const vary = headers.get("vary");
    if (!vary) headers.set("vary", "Accept-Encoding");
    else if (!/accept-encoding/i.test(vary)) headers.set("vary", `${vary}, Accept-Encoding`);

    return new Response(response.body!.pipeThrough(new CompressionStream("gzip")), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
}
