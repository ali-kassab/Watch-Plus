import { ActivityIcon, BellRingIcon, GlobeIcon, ShieldCheckIcon, SirenIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: ActivityIcon, title: "HTTP monitoring", text: "Check websites and APIs every few seconds with custom methods, headers, bodies and expected status codes." },
  { icon: SirenIcon, title: "Incident management", text: "Outages open incidents automatically. Track them through investigation to resolution with a full timeline." },
  { icon: BellRingIcon, title: "Alerts that arrive", text: "E-mail and signed webhooks with retries and a delivery log, so you know every alert was sent." },
  { icon: GlobeIcon, title: "Public status pages", text: "Share live status, 90-day uptime history and incident updates with your customers." },
  { icon: UsersIcon, title: "Built for teams", text: "Workspaces with owner, admin, member and viewer roles and email invitations." },
  { icon: ShieldCheckIcon, title: "Secure by default", text: "SSRF protection, rotating refresh tokens, encrypted secrets and strict workspace isolation." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Logo />
        <div className="flex-1" />
        <ThemeToggle />
        <Button asChild variant="ghost"><Link href="/login">Sign in</Link></Button>
        <Button asChild><Link href="/register">Get started</Link></Button>
      </header>
      <main>
        <section className="mx-auto max-w-4xl px-4 pt-20 pb-16 text-center">
          <p className="text-primary mb-4 text-sm font-medium">Uptime monitoring · Incident management · Status pages</p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">Know your APIs are up before your customers ask.</h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-balance">
            PulseWatch checks your endpoints around the clock, opens incidents the moment something breaks and keeps your team and users informed.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg"><Link href="/register">Start monitoring</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/status/demo-inc">View a status page</Link></Button>
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card rounded-xl border p-6">
              <f.icon className="text-primary mb-3 size-5" />
              <h2 className="font-medium">{f.title}</h2>
              <p className="text-muted-foreground mt-1 text-sm">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="text-muted-foreground border-t py-8 text-center text-sm">PulseWatch — a portfolio project by Ali Kassab.</footer>
    </div>
  );
}
