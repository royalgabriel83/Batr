import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { PRODUCT_NAME, safeReturnPath } from "@batr/shared";
import { getPendingEmail } from "@/lib/auth/pending-email";
import { firstParam } from "@/lib/forms/search-params";
import { ResendForm } from "../../ResendForm";

export const metadata: Metadata = { title: `Check your email · ${PRODUCT_NAME}` };

export default async function CheckEmailPage({ searchParams }: PageProps<"/sign-up/check-email">) {
  const next = safeReturnPath(firstParam((await searchParams).next));
  const email = await getPendingEmail();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <MailCheck aria-hidden="true" className="size-6 text-accent-primary" />
        <h1 className="text-h2">Check your email</h1>
        <p className="text-body text-text-secondary">
          {email ? (
            <>
              If <strong className="font-semibold text-text-primary">{email}</strong> can be used for a new account,
              we&apos;ve sent a link to confirm it.
            </>
          ) : (
            "If this email can be used for a new account, we've sent a link to confirm it."
          )}{" "}
          Open the link to finish signing up.
        </p>
        <p className="text-body-sm text-text-muted">
          Nothing arrived? Check your spam folder, or the address may already have an account. Try signing in.
        </p>
      </div>
      {email ? <ResendForm email={email} next={next} /> : null}
      <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="text-body-sm font-semibold text-accent-primary underline">
        Go to sign in
      </Link>
    </div>
  );
}
