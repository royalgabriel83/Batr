import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { admin, anonClient, connect, createMember, PUBLISHABLE_FIELDS, type Member } from "../../../../supabase/tests/support/db.ts";

// Calls the real route handlers in-process with real members' own
// sessions (Bearer access tokens) against the local Supabase.

export { admin, anonClient, connect, PUBLISHABLE_FIELDS };

export type ApiMember = Member & { token: string };

export async function member(label: string): Promise<ApiMember> {
  const created = await createMember(label);
  const { data } = await created.client.auth.getSession();
  if (!data.session) throw new Error("no session");
  return { ...created, token: data.session.access_token };
}

/** Any route handler; each declares its own typed params. */
export type Handler = (request: Request, context: never) => Promise<Response>;

export interface CallOptions {
  as?: ApiMember | null;
  key?: string | null;
  body?: unknown;
  form?: FormData;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  query?: string;
}

// Response bodies are JSON checked by the assertions themselves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface ApiResult<T = Json> {
  status: number;
  headers: Headers;
  body: { data?: T; error?: { code: string; message: string; [key: string]: Json } };
}

/** Calls a route handler like an HTTP request. A fresh idempotency key is sent unless `key` is given or null. */
export async function call<T = Json>(handler: Handler, method: string, path: string, options: CallOptions = {}): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers);
  if (options.as) headers.set("authorization", `Bearer ${options.as.token}`);
  const key = options.key === undefined ? (method === "GET" ? null : randomUUID()) : options.key;
  if (key) headers.set("idempotency-key", key);
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }
  const request = new Request(`http://localhost${path}${options.query ?? ""}`, { method, headers, body });
  const context = { params: Promise.resolve(options.params ?? {}) };
  const response = await handler(request, context as never);
  return { status: response.status, headers: response.headers, body: (await response.json()) as ApiResult<T>["body"] };
}

export const expectations = (offer: { status: string; revision: number }) => ({
  expected_status: offer.status,
  expected_revision: offer.revision,
});

/** A real JPEG with camera rotation (90°) and GPS location in its EXIF data. */
export async function phoneJpeg(width = 3000, height = 2000): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "TestCam", Model: "Phone 1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 1234/100", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 3900/100" },
    })
    .toBuffer();
}

export const png = (w = 800, h = 600) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 80, b: 60, alpha: 1 } } }).png().toBuffer();
export const webp = (w = 300, h = 200) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 10, b: 10 } } }).webp().toBuffer();

export function photoForm(bytes: Uint8Array, offer: { status: string; revision: number }, name = "photo.jpg", type = "image/jpeg", extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  form.set("expected_status", offer.status);
  form.set("expected_revision", String(offer.revision));
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return form;
}

export { randomUUID };
