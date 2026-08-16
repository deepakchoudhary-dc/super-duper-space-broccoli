/**
 * Type definitions for @api-guardian/sdk
 */

export interface ApiGuardianOptions {
  baseUrl: string;
  apiKey: string;
  userId: string;
  apiId: string;
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  traceparent?: string;
}

export class ApiGuardianError extends Error {
  status?: number;
  statusText?: string;
  body?: unknown;
  url?: string;
}

export class RateLimitError extends ApiGuardianError {
  retryAfterSeconds?: number;
}

export class UpstreamError extends ApiGuardianError {}

export class ApiGuardian {
  constructor(options: ApiGuardianOptions);
  request<T = unknown>(method: string, path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  get<T = unknown>(path: string, opts?: RequestOptions): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  delete<T = unknown>(path: string, opts?: RequestOptions): Promise<T>;
}
