"use client";

import { Button } from "@/components/ui/button";

export function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm">
      <span className="text-muted-foreground">Page {page} of {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</Button>
    </div>
  );
}
