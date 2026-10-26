"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { WARNING_MESSAGE } from "@batr/shared";
import { apiRequest } from "@/lib/offers/api-client";

/**
 * Milestone 8, W7: a warned member sees this once. It's marked seen as
 * soon as it shows, so it doesn't come back on the next page; the
 * member can also close it here.
 */
export function WarningBanner() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    void apiRequest("/api/v1/me/warning", { method: "POST" });
  }, []);

  if (!open) return null;
  return (
    <div role="status" className="border-b border-state-info/30 bg-state-info-soft">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2 text-body-sm md:px-6 lg:px-8">
        <Info aria-hidden="true" className="mt-2.5 size-5 shrink-0 text-state-info" />
        <p className="flex-1 py-2">
          <span className="font-semibold">{WARNING_MESSAGE}</span>{" "}
          <Link href="/rules" className="font-semibold underline underline-offset-2">
            Read the rules
          </Link>
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-bg-subtle focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </div>
  );
}
