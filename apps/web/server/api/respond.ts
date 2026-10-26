import { API_ERROR_MESSAGES, API_ERROR_STATUS, type ApiErrorCode } from "@batr/shared";

// Response shapes from specs/milestone-1.md (API): `{ data }` or
// `{ error: { code, message, fields?, ... } }`. Every API response may
// carry photo links or a non-active offer, so none may be cached
// (milestone-1.md, Caching).

const NO_STORE = { "Cache-Control": "private, no-store" };

export function ok(data: unknown, status = 200): Response {
  return Response.json({ data }, { status, headers: NO_STORE });
}

export type ApiErrorExtra = Record<string, unknown> & { message?: string; fields?: Record<string, string> };

/** Thrown inside a handler to end it with an API error. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly extra: ApiErrorExtra = {},
  ) {
    super(extra.message ?? API_ERROR_MESSAGES[code]);
  }

  toResponse(): Response {
    const { message, ...rest } = this.extra;
    return Response.json(
      { error: { code: this.code, message: message ?? API_ERROR_MESSAGES[this.code], ...rest } },
      { status: API_ERROR_STATUS[this.code], headers: NO_STORE },
    );
  }
}

/**
 * Runs a route handler: an ApiError becomes its response; anything
 * unexpected becomes 500 INTERNAL without internal details.
 */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error("API error", error);
    return new ApiError("INTERNAL").toResponse();
  }
}
