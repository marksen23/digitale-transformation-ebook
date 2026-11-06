/**
 * compressResponses.ts — verhandelt Brotli, sonst gzip, für Text-Antworten.
 *
 * SSE (Cache-Control: no-transform, text/event-stream) und binäre Typen
 * bleiben unangetastet. Vary: Accept-Encoding, damit Caches die Varianten
 * nicht vermischen. Kleine Körper unter 1 KB, die in einem Stück an
 * res.end gehen, bleiben unkomprimiert.
 *
 * Backpressure: express.static schreibt in vielen Chunks. Der Kompressor
 * meldet „voll" über drain an die Response, und ein voller Socket pausiert
 * den Kompressor — sonst hängt die gestreamte Datei.
 */
import { createBrotliCompress, createGzip, constants, type BrotliCompress, type Gzip } from "node:zlib";
import type { Request, Response, NextFunction } from "express";

const MIN_BYTES = 1024;
type Compressor = BrotliCompress | Gzip;

function varyHeader(current: unknown): string {
  const parts = String(current ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (!parts.some(p => p.toLowerCase() === "accept-encoding")) parts.push("Accept-Encoding");
  return parts.join(", ");
}

function byteLength(chunk: unknown, encoding?: BufferEncoding): number {
  if (typeof chunk === "string") return encoding ? Buffer.byteLength(chunk, encoding) : Buffer.byteLength(chunk);
  if (Buffer.isBuffer(chunk)) return chunk.length;
  if (chunk instanceof Uint8Array) return chunk.byteLength;
  return 0;
}

export function compressResponses(req: Request, res: Response, next: NextFunction): void {
  const accept = req.headers["accept-encoding"];
  if (typeof accept !== "string") {
    next();
    return;
  }
  const brotli = /\bbr\b/.test(accept);
  const gzip = /\bgzip\b/.test(accept);
  if (!brotli && !gzip) {
    next();
    return;
  }
  const encoding = brotli ? "br" : "gzip";

  const originalEnd = res.end.bind(res);
  const originalWrite = res.write.bind(res);
  let decided = false;
  let compressor: Compressor | null = null;

  function writePlain(chunk: unknown, enc: BufferEncoding | undefined, cb?: () => void): boolean {
    if (enc) return originalWrite(chunk as never, enc, cb as never);
    if (cb) return originalWrite(chunk as never, cb as never);
    return originalWrite(chunk as never);
  }

  function endPlain(chunk: unknown | undefined, enc: BufferEncoding | undefined, cb?: () => void): Response {
    if (chunk === undefined) {
      if (cb) return originalEnd(cb as never);
      return originalEnd();
    }
    if (enc) return originalEnd(chunk as never, enc, cb as never);
    if (cb) return originalEnd(chunk as never, cb as never);
    return originalEnd(chunk as never);
  }

  function skip(ct: string, cacheControl: string): boolean {
    if (cacheControl.includes("no-transform")) return true;
    if (res.getHeader("Content-Encoding")) return true;
    if (res.statusCode === 204 || res.statusCode === 304) return true;
    if (/event-stream|image\/|audio\/|video\/|font\/|wasm|pdf|octet-stream/i.test(ct)) return true;
    if (ct && !/json|text|javascript|xml|svg|\+json/i.test(ct)) return true;
    return false;
  }

  function startCompressor(): Compressor {
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Vary", varyHeader(res.getHeader("Vary")));
    res.removeHeader("Content-Length");
    const stream: Compressor = encoding === "br"
      ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
      : createGzip({ level: 6 });
    const onSocketDrain = () => { stream.resume(); };
    res.on("drain", onSocketDrain);
    stream.on("data", (chunk: Buffer) => {
      if (!originalWrite(chunk)) stream.pause();
    });
    stream.on("drain", () => { res.emit("drain"); });
    stream.on("end", () => { res.removeListener("drain", onSocketDrain); });
    stream.on("error", (err: Error) => {
      res.removeListener("drain", onSocketDrain);
      console.error(`[compress] ${err.message}`);
      if (!res.writableEnded) res.destroy(err);
    });
    return stream;
  }

  function finishCompressed(stream: Compressor, chunk: unknown | undefined, enc: BufferEncoding | undefined, cb?: () => void): void {
    stream.once("end", () => { endPlain(undefined, undefined, cb); });
    if (chunk === undefined) stream.end();
    else if (enc) stream.end(chunk as never, enc);
    else stream.end(chunk as never);
  }

  res.write = function write(chunk: unknown, enc?: BufferEncoding | (() => void), cb?: () => void): boolean {
    let encodingArg: BufferEncoding | undefined;
    let callback = cb;
    if (typeof enc === "function") { callback = enc; encodingArg = undefined; }
    else encodingArg = enc;

    if (!decided) {
      decided = true;
      const ct = String(res.getHeader("Content-Type") ?? "");
      const cc = String(res.getHeader("Cache-Control") ?? "");
      if (!skip(ct, cc)) compressor = startCompressor();
    }
    if (!compressor) return writePlain(chunk, encodingArg, callback);
    if (encodingArg) return compressor.write(chunk as never, encodingArg, callback);
    if (callback) return compressor.write(chunk as never, callback);
    return compressor.write(chunk as never);
  } as typeof res.write;

  res.end = function end(chunk?: unknown, enc?: BufferEncoding | (() => void), cb?: () => void): Response {
    let data: unknown = chunk;
    let encodingArg: BufferEncoding | undefined;
    let callback: (() => void) | undefined = cb;
    if (typeof data === "function") { callback = data as () => void; data = undefined; }
    else if (typeof enc === "function") { callback = enc; }
    else encodingArg = enc;

    const hasBody = data !== undefined && data !== null;
    if (!decided) {
      decided = true;
      const ct = String(res.getHeader("Content-Type") ?? "");
      const cc = String(res.getHeader("Cache-Control") ?? "");
      const size = hasBody ? byteLength(data, encodingArg) : 0;
      if (!skip(ct, cc) && size >= MIN_BYTES) compressor = startCompressor();
    }
    if (!compressor) return endPlain(hasBody ? data : undefined, encodingArg, callback);
    finishCompressed(compressor, hasBody ? data : undefined, encodingArg, callback);
    return res;
  } as typeof res.end;

  next();
}
