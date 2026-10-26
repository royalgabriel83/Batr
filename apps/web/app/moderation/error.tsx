"use client";

import { RotateCw } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";

// W10: a case or list that didn't load, with Retry.
export default function ModerationError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <EmptyState role="alert" icon={<RotateCw aria-hidden="true" />} title="This didn't load" action={<Button onClick={reset}>Retry</Button>}>
        Check your connection and try again.
      </EmptyState>
    </main>
  );
}
