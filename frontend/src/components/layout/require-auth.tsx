"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { FullPageSpinner } from "@/components/common/states";
import { useAuth } from "@/components/providers/auth-provider";

/** Client-side gate for signed-in areas. Authorization itself is always enforced by the API. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);
  if (status !== "authenticated") return <FullPageSpinner />;
  return <>{children}</>;
}
