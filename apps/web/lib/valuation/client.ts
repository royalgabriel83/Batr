import { apiRequest, newIdempotencyKey, uploadWithProgress } from "@/lib/offers/api-client";
import type { ApiResult } from "@/lib/offers/types";

// Browser calls to the valuation API. One idempotency key per attempt,
// kept after a network failure so a retry can never apply twice.

export function keyedRequest() {
  const keys = new Map<string, string>();
  return async function send<T>(name: string, path: string, method: "POST" | "PATCH" | "DELETE", json?: unknown): Promise<ApiResult<T>> {
    const key = keys.get(name) ?? newIdempotencyKey();
    keys.set(name, key);
    const result = await apiRequest<T>(path, { method, json, idempotencyKey: key });
    if (result.ok || result.error.code !== "NETWORK") keys.delete(name);
    return result;
  };
}

export function uploadEvidenceFile<T>(valuationId: string, file: File, kind: string, componentId: string | null, onProgress: (percent: number) => void) {
  const form = new FormData();
  form.set("file", file);
  form.set("kind", kind);
  if (componentId) form.set("component_id", componentId);
  return uploadWithProgress<T>(`/api/v1/valuations/${valuationId}/evidence`, form, newIdempotencyKey(), onProgress);
}

/** Opens a two-minute link to an evidence file in a new tab. */
export async function openEvidence(valuationId: string, evidenceId: string): Promise<string | null> {
  // Opened before the request so the browser treats it as the click's own window.
  const opened = window.open("about:blank", "_blank");
  if (opened) opened.opener = null;
  const result = await apiRequest<{ url: string }>(`/api/v1/valuations/${valuationId}/evidence/${evidenceId}`);
  if (!result.ok) {
    opened?.close();
    return result.error.message;
  }
  if (!opened) return "Your browser blocked the new tab. Allow pop-ups for BATR, then try again.";
  opened.location.href = result.data.url;
  return null;
}
