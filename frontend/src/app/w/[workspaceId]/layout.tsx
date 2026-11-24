import { Suspense } from "react";
import { FullPageSpinner } from "@/components/common/states";
import { WorkspaceRoot } from "./workspace-gate";

/** Server layout: the client workspace shell reads route params, so it streams inside Suspense. */
export default function WorkspaceLayout({ children }: LayoutProps<"/w/[workspaceId]">) {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <WorkspaceRoot>{children}</WorkspaceRoot>
    </Suspense>
  );
}
