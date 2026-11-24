"use client";

import { createContext, useContext } from "react";
import type { Workspace } from "@/lib/types";

const WorkspaceContext = createContext<Workspace | null>(null);
export const WorkspaceProvider = WorkspaceContext.Provider;

export function useCurrentWorkspace(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error("useCurrentWorkspace must be used inside a workspace route");
  return ws;
}
