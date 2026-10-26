import type { FormAlertTone } from "@/components/ui";

export interface FormMessage {
  tone: FormAlertTone;
  text: string;
}

/** What a server action returns to its form: kept values, field errors, one message. */
export interface FormState<Values extends Record<string, string>, Field extends string = keyof Values & string> {
  values: Values;
  errors: Partial<Record<Field, string>>;
  message?: FormMessage;
}

/** Reads a text field from submitted form data ("" when absent or a file). */
export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
