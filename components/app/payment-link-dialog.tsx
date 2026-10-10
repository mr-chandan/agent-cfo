"use client";

import { useState } from "react";
import { Link2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function PaymentLinkDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setUrl("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Could not create link");
      setUrl(json.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Request payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a payment</DialogTitle>
          <DialogDescription>
            Creates a secure checkout link (test mode). Share it with your customer — use card 4242 4242 4242 4242.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input type="email" placeholder="Customer email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button className="w-full" disabled={busy || !email} onClick={create}>
            {busy ? "Creating…" : "Create payment link"}
          </Button>
          {url && (
            <div className="bg-muted flex items-center gap-2 rounded-lg p-3 text-sm">
              <Link2 className="size-4 shrink-0" />
              <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline">
                {url}
              </a>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(url);
                  toast.success("Link copied");
                }}
              >
                Copy
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
