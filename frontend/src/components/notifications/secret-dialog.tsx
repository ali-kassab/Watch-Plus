"use client";

import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shows a webhook signing secret exactly once (the API never returns it again). */
export function SecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!secret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Webhook signing secret</DialogTitle>
          <DialogDescription>
            Copy it now — it will not be shown again. Verify the <code className="font-mono">X-PulseWatch-Signature</code> header
            (HMAC-SHA256 of <code className="font-mono">{"{t}.{body}"}</code>) with this secret.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted rounded-md p-3 font-mono text-sm break-all select-all">{secret}</div>
        <DialogFooter>
          {secret && <CopyButton value={secret} />}
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
