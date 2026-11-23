import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { isPublicAddress, validateTargetUrl } from './ip-policy.js';

export type HttpErrorType = 'TIMEOUT' | 'DNS' | 'CONNECTION' | 'TLS' | 'BLOCKED_TARGET' | 'UNKNOWN';

export class SafeHttpError extends Error {
  constructor(
    readonly type: HttpErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'SafeHttpError';
  }
}

export interface SafeRequestOptions {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string | null;
  timeoutMs: number;
  allowPrivate: boolean;
  /** Bytes of the response body to read before the connection is closed. */
  maxBodyBytes?: number;
}

export interface SafeResponse {
  statusCode: number;
  responseTimeMs: number;
  body: string;
}

const USER_AGENT = 'PulseWatch/1.0 (+https://github.com/ali-kassab/pulsewatch)';

/**
 * DNS lookup used for the actual socket connection. Because the address is checked
 * here (and not in a separate pre-flight lookup) DNS-rebinding cannot swap in a
 * private address between validation and connection.
 */
export function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { all: true, verbatim: true, family: options.family }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      if (!allowPrivate) {
        const blocked = addresses.find((a) => !isPublicAddress(a.address));
        if (blocked) {
          return callback(new SafeHttpError('BLOCKED_TARGET', 'Host resolves to a private or reserved address') as NodeJS.ErrnoException, '', 0);
        }
      }
      if (addresses.length === 0) return callback(Object.assign(new Error('No addresses'), { code: 'ENOTFOUND' }), '', 0);
      if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/**
 * Performs one HTTP request with SSRF protection, an overall timeout and a capped
 * body read. Redirects are NOT followed (a 3xx is reported as-is) so a public URL
 * cannot redirect the checker into an internal network.
 */
export function safeRequest(opts: SafeRequestOptions): Promise<SafeResponse> {
  const validation = validateTargetUrl(opts.url, opts.allowPrivate);
  if (!validation.ok) return Promise.reject(new SafeHttpError('BLOCKED_TARGET', validation.reason));
  const url = validation.url;
  const maxBody = opts.maxBodyBytes ?? 64 * 1024;
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise<SafeResponse>((resolve, reject) => {
    const started = performance.now();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: '*/*', ...opts.headers };
    const hasBody = opts.body != null && opts.body !== '' && !['GET', 'HEAD'].includes(opts.method);
    if (hasBody) headers['content-length'] = String(Buffer.byteLength(opts.body!));

    const req = transport.request(url, {
      method: opts.method,
      headers,
      agent: false,
      lookup: guardedLookup(opts.allowPrivate),
    });

    const timer = setTimeout(() => {
      finish(() => reject(new SafeHttpError('TIMEOUT', `Request timed out after ${opts.timeoutMs} ms`)));
      req.destroy();
    }, opts.timeoutMs);

    req.on('response', (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const done = () =>
        finish(() =>
          resolve({
            statusCode: res.statusCode ?? 0,
            responseTimeMs: Math.round(performance.now() - started),
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      res.on('data', (chunk: Buffer) => {
        if (size < maxBody) chunks.push(chunk.subarray(0, maxBody - size));
        size += chunk.length;
        if (size >= maxBody) {
          done();
          res.destroy();
        }
      });
      res.on('end', done);
      res.on('error', (e) => finish(() => reject(classify(e))));
    });
    req.on('error', (e) => finish(() => reject(classify(e))));
    if (hasBody) req.write(opts.body);
    req.end();
  });
}

export function classify(error: unknown): SafeHttpError {
  if (error instanceof SafeHttpError) return error;
  const e = error as NodeJS.ErrnoException;
  const code = e?.code ?? '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA') return new SafeHttpError('DNS', `DNS lookup failed (${code})`);
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code) || /certificate|tls/i.test(e?.message ?? '')) {
    return new SafeHttpError('TLS', `TLS error (${code || 'handshake failed'})`);
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED'].includes(code)) {
    return new SafeHttpError('CONNECTION', `Connection failed (${code})`);
  }
  if (e?.cause instanceof SafeHttpError) return e.cause;
  return new SafeHttpError('UNKNOWN', e?.message ? e.message.slice(0, 200) : 'Unknown network error');
}
