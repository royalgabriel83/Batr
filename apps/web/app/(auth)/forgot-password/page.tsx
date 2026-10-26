import type { Metadata } from "next";
import Link from "next/link";
import { AUTH_MESSAGES, PRODUCT_NAME, safeReturnPath } from "@batr/shared";
import { FormAlert } from "@/components/ui";
import { firstParam } from "@/lib/forms/search-params";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: `Forgot password · ${PRODUCT_NAME}` };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  const next = safeReturnPath(firstParam(params.next));
  const linkFailed = firstParam(params.error) === "link";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2">Reset your password</h1>
        <p className="text-body-sm text-text-secondary">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      </div>
      {linkFailed ? <FormAlert tone="danger">{AUTH_MESSAGES.resetLinkInvalid}</FormAlert> : null}
      <ForgotPasswordForm />
      <p className="text-body-sm text-text-secondary">
        Remembered it?{" "}
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-accent-primary underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
