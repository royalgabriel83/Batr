import { API_ERROR_MESSAGES } from "@batr/shared";
import type { ApiErrorBody, ApiResult } from "./types";

// Browser calls to the offer API (apps/web/app/api/v1), the only place
// offers change. Requests carry the session cookie; the browser adds
// this site's Origin, which the API checks. Every mutation sends an
// Idempotency-Key chosen by the caller, so a retry of the same attempt
// reuses it and can never apply twice.

export const NETWORK_MESSAGE = "We couldn't reach BATR. Check your connection and try again.";

const networkError = (): ApiResult<never> => ({
  ok: false,
  status: 0,
  error: { code: "NETWORK", message: NETWORK_MESSAGE },
});

/** Turns a status and parsed body into a result; tolerant of bodies that are not the API's shape. */
export function toResult<T>(status: number, body: unknown): ApiResult<T> {
  if (status >= 200 && status < 300 && body && typeof body === "object" && "data" in body) {
    return { ok: true, data: (body as { data: T }).data };
  }
  const error = body && typeof body === "object" && "error" in body ? (body as { error: Partial<ApiErrorBody> }).error : null;
  if (error?.code && error.code in API_ERROR_MESSAGES) {
    return { ok: false, status, error: { ...error, code: error.code, message: error.message ?? API_ERROR_MESSAGES[error.code as keyof typeof API_ERROR_MESSAGES] } };
  }
  return { ok: false, status, error: { code: "INTERNAL", message: API_ERROR_MESSAGES.INTERNAL } };
}

export interface ApiRequest {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  json?: unknown;
  /** Required for every method except GET. */
  idempotencyKey?: string;
}

export async function apiRequest<T>(path: string, { method = "GET", json, idempotencyKey }: ApiRequest = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (json !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return networkError();
  }
  const body: unknown = await response.json().catch(() => null);
  return toResult<T>(response.status, body);
}

/**
 * Uploads one photo with progress (fetch cannot report upload progress).
 * Fields go in the same multipart form as the file.
 */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  idempotencyKey: string,
  onProgress: (percent: number) => void,
): Promise<ApiResult<T>> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", path);
    request.setRequestHeader("Idempotency-Key", idempotencyKey);
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    };
    request.onload = () => resolve(toResult<T>(request.status, request.response as unknown));
    request.onerror = () => resolve(networkError());
    request.onabort = () => resolve(networkError());
    request.send(form);
  });
}

/** A fresh key for one logical attempt. */
export const newIdempotencyKey = (): string => crypto.randomUUID();
