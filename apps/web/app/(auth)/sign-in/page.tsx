import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AUTH_MESSAGES, PRODUCT_NAME, safeReturnPath } from "@batr/shared";
import { FormAlert } from "@/components/ui";
import { firstParam } from "@/lib/forms/search-params";
import { getCurrentMember } from "@/server/auth";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: `Sign in · ${PRODUCT_NAME}` };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeReturnPath(firstParam(params.next));
  if (await getCurrentMember()) redirect(next);
  const linkFailed = firstParam(params.error) === "link";
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h2">Sign in</h1>
      {linkFailed ? <FormAlert tone="danger">{AUTH_MESSAGES.linkInvalid}</FormAlert> : null}
      <SignInForm next={next} />
      <p className="text-body-sm text-text-secondary">
        New to {PRODUCT_NAME}?{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-semibold text-accent-primary underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
