"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, toast } from "@/components/ui";
import { apiRequest } from "@/lib/offers/api-client";

/** W4: assign the case to the viewer, or take it over. The change is logged in the case. */
export function TakeCaseButton({ reportId, takeOver }: { reportId: string; takeOver: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function take() {
    setBusy(true);
    const result = await apiRequest(`/api/v1/moderation/reports/${reportId}/assign`, { method: "POST" });
    setBusy(false);
    if (!result.ok) {
      toast({ text: result.error.message });
      return;
    }
    toast({ text: "This case is assigned to you." });
    router.refresh();
  }

  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={() => void take()}>
      {takeOver ? "Take over this case" : "Take this case"}
    </Button>
  );
}
