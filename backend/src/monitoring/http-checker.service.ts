import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { classify, safeRequest } from '../common/net/safe-http.js';
import type { CheckErrorType, HttpMethod } from '../generated/prisma/enums.js';
import { isExpectedStatus } from './check-evaluator.js';

export interface CheckTarget {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: string | null;
  timeoutMs: number;
  expectedStatusCodes: number[];
  retries: number;
}

export interface CheckOutcome {
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  errorType: CheckErrorType | null;
  error: string | null;
  attempts: number;
}

/** Executes one monitor check, retrying failed attempts (never SSRF blocks) before reporting a failure. */
@Injectable()
export class HttpCheckerService {
  /** Delay between retry attempts; overridable in tests. */
  retryDelayMs = 1000;

  constructor(private readonly config: AppConfig) {}

  async check(target: CheckTarget): Promise<CheckOutcome> {
    let outcome: CheckOutcome | undefined;
    const maxAttempts = 1 + Math.max(0, target.retries);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      outcome = await this.attempt(target, attempt);
      if (outcome.success || outcome.errorType === 'BLOCKED_TARGET') break;
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, this.retryDelayMs));
    }
    return outcome!;
  }

  private async attempt(target: CheckTarget, attempt: number): Promise<CheckOutcome> {
    try {
      const res = await safeRequest({
        url: target.url,
        method: target.method,
        headers: target.headers,
        body: target.body,
        timeoutMs: target.timeoutMs,
        allowPrivate: this.config.get('ALLOW_PRIVATE_TARGETS'),
        maxBodyBytes: 16 * 1024,
      });
      const success = isExpectedStatus(res.statusCode, target.expectedStatusCodes);
      return {
        success,
        statusCode: res.statusCode,
        responseTimeMs: res.responseTimeMs,
        errorType: success ? null : 'STATUS_MISMATCH',
        error: success ? null : `Unexpected status code ${res.statusCode} (expected ${summarize(target.expectedStatusCodes)})`,
        attempts: attempt,
      };
    } catch (e) {
      const err = classify(e);
      return { success: false, statusCode: null, responseTimeMs: null, errorType: err.type, error: err.message, attempts: attempt };
    }
  }
}

function summarize(codes: number[]): string {
  return codes.length > 5 ? `${codes.slice(0, 5).join(', ')}, …` : codes.join(', ');
}
