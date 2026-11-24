import type { Metadata } from "next";
import { Suspense } from "react";
import { FullPageSpinner } from "@/components/common/states";
import { InvitationView } from "./invitation-view";

export const metadata: Metadata = { title: "Invitation" };

export default function InvitationPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <InvitationView />
    </Suspense>
  );
}
