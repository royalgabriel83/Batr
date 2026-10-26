import { checkInput, type Schema } from "@batr/shared";
import { ApiError } from "./respond";

/** Parses a JSON body with a shared schema; 422 with one message per field otherwise. */
export async function parseBody<T>(request: Request, schema: Schema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("VALIDATION_FAILED", { fields: { body: "Send a JSON body." } });
  }
  return checkOrFail(schema, body);
}

export function checkOrFail<T>(schema: Schema<T>, input: unknown): T {
  const checked = checkInput(schema, input);
  if (!checked.ok) throw new ApiError("VALIDATION_FAILED", { fields: checked.errors });
  return checked.data;
}
