import { z } from "zod";
import { fieldErrors } from "../offers/schemas.ts";

// Account rules from specs/05-auth-and-permissions.md (Validation) and
// specs/milestone-1.md (email and password only). The password minimum
// of 10 is marked PROPOSED in the auth spec; Supabase enforces the same
// number (supabase/config.toml), so changing it means changing both.

export const AUTH_LIMITS = {
  emailMax: 254,
  passwordMin: 10,
  /** bcrypt ignores bytes past 72, so longer passwords are refused. */
  passwordMaxBytes: 72,
  displayNameMin: 2,
  displayNameMax: 40,
} as const;

/**
 * Display names may not contain links. The database copy of this
 * pattern (private.valid_display_name) must stay identical; a parity
 * test compares them case by case. Written so it means the same in
 * JavaScript and PostgreSQL regular expressions (case-insensitive).
 */
export const DISPLAY_NAME_LINK_PATTERN =
  "(https?:|://|www\\.|\\.(com|net|org|io|co|uk|app|dev|xyz|info|me|ly|gg|link|shop|site|online)([^a-z0-9]|$))";
const linkPattern = new RegExp(DISPLAY_NAME_LINK_PATTERN, "i");

/** Characters as the database counts them (code points, not UTF-16 units). */
const charCount = (value: string) => [...value].length;
/** UTF-8 length, counted by hand so this runs anywhere (web, server, mobile). */
const byteCount = (value: string) =>
  [...value].reduce((total, char) => {
    const code = char.codePointAt(0) ?? 0;
    return total + (code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4);
  }, 0);

const { emailMax, passwordMin, passwordMaxBytes, displayNameMin, displayNameMax } = AUTH_LIMITS;

export const EmailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(emailMax, "Enter a shorter email address.")
  .pipe(z.email("Enter an email address like name@example.com."));

export const NewPasswordSchema = z
  .string()
  .min(passwordMin, `Use at least ${String(passwordMin)} characters.`)
  .refine((value) => byteCount(value) <= passwordMaxBytes, "Use a shorter password.");

export const DisplayNameSchema = z
  .string()
  .trim()
  .refine((value) => charCount(value) >= displayNameMin, `Use at least ${String(displayNameMin)} characters.`)
  .refine((value) => charCount(value) <= displayNameMax, `Use ${String(displayNameMax)} characters or fewer.`)
  .refine((value) => !linkPattern.test(value), "Display names can't include links.");

export const SignUpInputSchema = z.strictObject({
  email: EmailSchema,
  password: NewPasswordSchema,
  display_name: DisplayNameSchema,
});
export type SignUpInput = z.infer<typeof SignUpInputSchema>;

/** Sign-in checks only that fields are filled, so it reveals no rules. */
export const SignInInputSchema = z.strictObject({
  email: EmailSchema,
  password: z.string().min(1, "Enter your password."),
});
export type SignInInput = z.infer<typeof SignInInputSchema>;

/** Forgot password: the email only. */
export const PasswordResetRequestSchema = z.strictObject({ email: EmailSchema });
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

/** Set a new password: the sign-up rule. */
export const NewPasswordInputSchema = z.strictObject({ password: NewPasswordSchema });
export type NewPasswordInput = z.infer<typeof NewPasswordInputSchema>;

export const DisplayNameInputSchema = z.strictObject({ display_name: DisplayNameSchema });

export type AuthFieldErrors<T> = Partial<Record<keyof T, string>>;
export type AuthCheck<T> = { ok: true; data: T } | { ok: false; errors: AuthFieldErrors<T> };

/** Parses form input; returns the cleaned data or one message per field. */
export function checkAuthInput<S extends z.ZodType<Record<string, unknown>>>(
  schema: S,
  input: unknown,
): AuthCheck<z.infer<S>> {
  const parsed = schema.safeParse(input);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, errors: fieldErrors(parsed.error) as AuthFieldErrors<z.infer<S>> };
}
