import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PRODUCT_NAME, safeReturnPath } from "@batr/shared";
import { firstParam } from "@/lib/forms/search-params";
import { getCurrentMember } from "@/server/auth";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = { title: `Create an account · ${PRODUCT_NAME}` };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const next = safeReturnPath(firstParam((await searchParams).next));
  if (await getCurrentMember()) redirect(next);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h2">Create your account</h1>
        <p className="text-body-sm text-text-secondary">You&apos;ll confirm your email before you can sign in.</p>
      </div>
      <SignUpForm next={next} />
      <p className="text-body-sm text-text-secondary">
        Already have an account?{" "}
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-accent-primary underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
