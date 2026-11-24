import { BotIcon, CheckCircle2Icon, FlagIcon, LockIcon, MessageSquareIcon, RefreshCwIcon, type LucideIcon } from "lucide-react";
import { IncidentStatusBadge } from "@/components/status/status-badge";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { IncidentUpdate } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<IncidentUpdate["type"], LucideIcon> = {
  CREATED: FlagIcon,
  STATUS_CHANGE: RefreshCwIcon,
  UPDATE: MessageSquareIcon,
  NOTE: LockIcon,
  RESOLVED: CheckCircle2Icon,
};

const LABEL: Record<IncidentUpdate["type"], string> = {
  CREATED: "Incident opened",
  STATUS_CHANGE: "Status changed",
  UPDATE: "Update",
  NOTE: "Internal note",
  RESOLVED: "Resolved",
};

/** Newest-first timeline of an incident's updates (the API returns them ordered by createdAt desc). */
export function IncidentTimeline({ updates }: { updates: IncidentUpdate[] }) {
  if (updates.length === 0) return <p className="text-muted-foreground text-sm">No updates yet.</p>;
  return (
    <ol className="relative space-y-6 ps-9 before:absolute before:inset-y-1 before:start-[11px] before:w-px before:bg-border">
      {updates.map((u) => {
        const Icon = ICON[u.type];
        return (
          <li key={u.id} className="relative">
            <span
              className={cn(
                "bg-background absolute -start-9 top-0 grid size-6 place-items-center rounded-full border",
                u.type === "RESOLVED" && "border-status-good/50 text-status-good",
                u.type === "NOTE" && "border-dashed",
              )}
              aria-hidden
            >
              <Icon className="size-3.5" />
            </span>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{LABEL[u.type]}</span>
              {u.status && <IncidentStatusBadge status={u.status} />}
              {u.isInternal && <span className="text-muted-foreground text-xs">(team only)</span>}
            </div>
            <p className={cn("mt-1 text-sm whitespace-pre-wrap break-words", u.isInternal && "bg-muted/60 rounded-md px-3 py-2")}>{u.message}</p>
            <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
              {u.author ? u.author.name : <><BotIcon className="size-3" aria-hidden /> PulseWatch</>}
              <span aria-hidden>·</span>
              <time dateTime={u.createdAt} title={formatDateTime(u.createdAt)}>{timeAgo(u.createdAt)}</time>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
