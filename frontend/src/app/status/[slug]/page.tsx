import { AlertTriangleIcon, CheckCircle2Icon, SearchXIcon, XCircleIcon, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { IncidentStatusBadge, MonitorStatusBadge, SeverityBadge } from "@/components/status/status-badge";
import { UptimeHistory, UptimeLegend } from "@/components/status/uptime-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent, MOBILE_HISTORY_DAYS } from "@/lib/format";
import { getPublicStatusPage } from "@/lib/public-status";
import type { PublicIncident, PublicStatusPage } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Server-rendered times use UTC so the output is the same for every visitor and server. */
const utc = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const fmt = (iso: string) => `${utc.format(new Date(iso))} UTC`;

const OVERALL: Record<PublicStatusPage["status"], { label: string; icon: LucideIcon; cls: string }> = {
  operational: { label: "All systems operational", icon: CheckCircle2Icon, cls: "border-status-good/40 bg-status-good/5 [&_svg]:text-status-good" },
  degraded: { label: "Some systems are experiencing issues", icon: AlertTriangleIcon, cls: "border-status-warning/60 bg-status-warning/10 [&_svg]:text-amber-700 dark:[&_svg]:text-status-warning" },
  partial_outage: { label: "Partial outage", icon: AlertTriangleIcon, cls: "border-status-serious/50 bg-status-serious/5 [&_svg]:text-status-serious" },
  major_outage: { label: "Major outage", icon: XCircleIcon, cls: "border-status-critical/40 bg-status-critical/5 [&_svg]:text-status-critical" },
};

export async function generateMetadata({ params }: PageProps<"/status/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicStatusPage(slug);
  if (page === "unavailable") return { title: "Status page", robots: { index: false } };
  if (!page) return { title: "Status page not found", robots: { index: false } };
  return { title: page.title, description: page.description ?? `Current status of ${page.title}` };
}

function IncidentCard({ incident }: { incident: PublicIncident }) {
  return (
    <article className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{incident.title}</h3>
        <IncidentStatusBadge status={incident.status} />
        <SeverityBadge severity={incident.severity} />
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {incident.affectedService ? `${incident.affectedService} · ` : ""}started {fmt(incident.startedAt)}
        {incident.resolvedAt ? ` · resolved ${fmt(incident.resolvedAt)}` : ""}
      </p>
      {incident.updates.length > 0 && (
        <ol className="mt-3 space-y-3 border-s ps-4">
          {incident.updates.map((u) => (
            <li key={u.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {u.status && <IncidentStatusBadge status={u.status} />}
                <time className="text-muted-foreground text-xs" dateTime={u.createdAt}>{fmt(u.createdAt)}</time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{u.message}</p>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

async function StatusView({ params }: { params: PageProps<"/status/[slug]">["params"] }) {
  const { slug } = await params;
  const page = await getPublicStatusPage(slug);
  if (page === "unavailable") {
    return (
      <div role="alert" className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
        <AlertTriangleIcon className="text-muted-foreground mb-3 size-6" aria-hidden />
        <h1 className="font-medium">Status temporarily unavailable</h1>
        <p className="text-muted-foreground mt-1 text-sm">We could not load this status page. Please try again in a moment.</p>
      </div>
    );
  }
  if (!page) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
        <SearchXIcon className="text-muted-foreground mb-3 size-6" aria-hidden />
        <h1 className="font-medium">Status page not found</h1>
        <p className="text-muted-foreground mt-1 text-sm">This page does not exist or has not been published.</p>
      </div>
    );
  }
  const overall = OVERALL[page.status];
  const OverallIcon = overall.icon;
  const days = page.services[0]?.history.length ?? 90;

  return (
    <>
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{page.title}</h1>
        {page.description && <p className="text-muted-foreground">{page.description}</p>}
      </header>

      <div role="status" className={cn("mb-8 flex items-center gap-3 rounded-xl border px-5 py-4 font-medium", overall.cls)}>
        <OverallIcon className="size-5 shrink-0" aria-hidden />
        {overall.label}
      </div>

      {page.activeIncidents.length > 0 && (
        <section className="mb-8" aria-labelledby="active-incidents">
          <h2 id="active-incidents" className="mb-3 text-lg font-semibold">Active incidents</h2>
          <div className="space-y-3">{page.activeIncidents.map((i) => <IncidentCard key={i.id} incident={i} />)}</div>
        </section>
      )}

      <Card className="mb-8 gap-4">
        <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-base">Services</CardTitle>
          <span className="text-muted-foreground text-xs">
            Uptime over the last <span className="sm:hidden">{Math.min(days, MOBILE_HISTORY_DAYS)}</span><span className="max-sm:hidden">{days}</span> days
          </span>
        </CardHeader>
        <CardContent className="space-y-6">
          {page.services.length === 0 ? (
            <p className="text-muted-foreground text-sm">No services are listed on this page yet.</p>
          ) : (
            page.services.map((s) => (
              <div key={s.key} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground tabular-nums">{formatPercent(s.uptime90d)} uptime</span>
                    <MonitorStatusBadge status={s.status} />
                  </span>
                </div>
                <UptimeHistory name={s.name} history={s.history} />
                <div className="text-muted-foreground flex justify-between text-xs" aria-hidden>
                  <span><span className="sm:hidden">{Math.min(days, MOBILE_HISTORY_DAYS)}</span><span className="max-sm:hidden">{days}</span> days ago</span>
                  <span>Today</span>
                </div>
              </div>
            ))
          )}
          {page.services.length > 0 && <UptimeLegend />}
        </CardContent>
      </Card>

      <section aria-labelledby="past-incidents">
        <h2 id="past-incidents" className="mb-3 text-lg font-semibold">Resolved in the last 30 days</h2>
        {page.resolvedIncidents.length === 0 ? (
          <p className="text-muted-foreground text-sm">No incidents reported.</p>
        ) : (
          <div className="space-y-3">{page.resolvedIncidents.map((i) => <IncidentCard key={i.id} incident={i} />)}</div>
        )}
      </section>

      <p className="text-muted-foreground mt-10 text-center text-xs">Last updated {fmt(page.generatedAt)}</p>
    </>
  );
}

function StatusSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Public status page. Data is fetched on the server per request (dynamic, streamed inside Suspense). */
export default function PublicStatusPageRoute({ params }: PageProps<"/status/[slug]">) {
  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-16 sm:px-6">
        <Suspense fallback={<StatusSkeleton />}>
          <StatusView params={params} />
        </Suspense>
      </main>
      <footer className="text-muted-foreground pb-8 text-center text-xs">Powered by PulseWatch</footer>
    </div>
  );
}
