"use client";

import {
  ActivityIcon, BellIcon, CheckIcon, ChevronsUpDownIcon, GlobeIcon, LayoutDashboardIcon, MenuIcon, PlusIcon, SettingsIcon, SirenIcon, UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { can } from "@/lib/format";
import { useWorkspaces } from "@/lib/queries";
import type { Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

function navFor(ws: Workspace) {
  const base = `/w/${ws.id}`;
  return [
    { href: base, label: "Dashboard", icon: LayoutDashboardIcon, exact: true },
    { href: `${base}/monitors`, label: "Monitors", icon: ActivityIcon },
    { href: `${base}/incidents`, label: "Incidents", icon: SirenIcon },
    ...(can(ws.role, "ADMIN") ? [{ href: `${base}/notifications`, label: "Notifications", icon: BellIcon }] : []),
    { href: `${base}/status-page`, label: "Status page", icon: GlobeIcon },
    { href: `${base}/team`, label: "Team", icon: UsersIcon },
    { href: `${base}/settings`, label: "Settings", icon: SettingsIcon },
  ];
}

function WorkspaceSwitcher({ current }: { current: Workspace }) {
  const { data } = useWorkspaces();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="truncate">{current.name}</span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start">
        <DropdownMenuLabel className="text-muted-foreground text-xs">Workspaces</DropdownMenuLabel>
        {data?.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link href={`/w/${w.id}`}>
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === current.id && <CheckIcon className="size-4" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding"><PlusIcon /> New workspace</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarNav({ ws, onNavigate }: { ws: Workspace; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Workspace">
      {navFor(ws).map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              active ? "bg-sidebar-accent text-foreground font-medium" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ ws, onNavigate }: { ws: Workspace; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="px-1 pt-1"><Logo href="/app" /></div>
      <WorkspaceSwitcher current={ws} />
      <SidebarNav ws={ws} onNavigate={onNavigate} />
      <div className="text-muted-foreground mt-auto px-2 text-xs">
        Signed in as <span className="text-foreground font-medium">{ws.role.toLowerCase()}</span>
      </div>
    </div>
  );
}

export function AppShell({ ws, children }: { ws: Workspace; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-screen w-60 shrink-0 border-r lg:block">
        <SidebarBody ws={ws} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody ws={ws} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex-1" />
          <ThemeToggle />
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
