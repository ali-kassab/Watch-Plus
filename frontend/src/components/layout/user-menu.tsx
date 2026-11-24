"use client";

import { LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2" aria-label="Account menu">
          <span className="bg-primary/10 text-primary grid size-7 place-items-center rounded-full text-xs font-semibold">{initials(user.name)}</span>
          <span className="hidden max-w-32 truncate text-sm md:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-muted-foreground truncate text-xs">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account"><UserIcon /> Account</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
