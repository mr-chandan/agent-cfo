"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ApprovalActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "failed");
      toast.success(approve ? "Approved and executed" : "Denied");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record decision");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => decide(true)}>
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(false)}>
        Deny
      </Button>
    </div>
  );
}
