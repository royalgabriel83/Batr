import { ShieldAlert } from "lucide-react";
import { SAFETY_FORBIDDEN_MESSAGES } from "@batr/shared";
import { SAFETY_CONTACT_EMAIL } from "@/lib/safety/contact";

/**
 * Shown on every page to a suspended member (milestone-6.md, S8). They
 * can still sign in and see their agreements. Appeals are by email,
 * outside BATR, for now.
 */
export function SuspendedBanner() {
  return (
    <div role="status" className="border-b border-state-warning/30 bg-state-warning-soft">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 text-body-sm md:px-6 lg:px-8">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-state-warning" />
        <p>
          <span className="font-semibold">{SAFETY_FORBIDDEN_MESSAGES.suspended}</span>{" "}
          {SAFETY_CONTACT_EMAIL ? (
            <>
              Questions? Write to{" "}
              <a href={`mailto:${SAFETY_CONTACT_EMAIL}`} className="font-semibold underline underline-offset-2">
                {SAFETY_CONTACT_EMAIL}
              </a>
              .
            </>
          ) : (
            "Questions? BATR's contact address is still to come."
          )}
        </p>
      </div>
    </div>
  );
}
