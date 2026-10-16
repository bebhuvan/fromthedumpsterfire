// Reading untrusted response bodies with hard limits on the bytes actually streamed. Content-Length
// is never trusted: a server can omit it, lie about it, or ignore a Range request and send the whole
// file. Every read here stops at its limit and cancels the rest of the body.

export class TooLargeError extends Error {
  readonly fatal = true;
}

/**
 * Read at most `keepFrom + keep` bytes and return the slice [keepFrom, keepFrom + keep). Used for
 * Range requests answered with 200 and the whole file: we stream past the bytes before our range
 * without keeping them, take our slice, and cancel. Never reads more than keepFrom + keep bytes.
 */
export async function readSlice(body: ReadableStream<Uint8Array> | null, keepFrom: number, keep: number): Promise<Uint8Array> {
  const out = new Uint8Array(keep);
  if (!body) return out.subarray(0, 0);
  const reader = body.getReader();
  let pos = 0; // bytes of the stream seen so far
  let filled = 0;
  try {
    while (filled < keep) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkStart = pos;
      pos += value.byteLength;
      if (pos <= keepFrom) continue;
      const from = Math.max(0, keepFrom - chunkStart);
      const take = Math.min(value.byteLength - from, keep - filled);
      out.set(value.subarray(from, from + take), filled);
      filled += take;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out.subarray(0, filled);
}

/** Read a whole body, refusing (and cancelling) as soon as it passes `max` bytes. */
export async function readCapped(body: ReadableStream<Uint8Array> | null, max: number, what = 'response'): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > max) throw new TooLargeError(`The ${what} is larger than ${Math.round(max / 1e6)} MB`);
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

/** JSON from a body capped at `max` bytes. */
export async function readJsonCapped<T>(body: ReadableStream<Uint8Array> | null, max: number, what = 'API response'): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await readCapped(body, max, what))) as T;
}
