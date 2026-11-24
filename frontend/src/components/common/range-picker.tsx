"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Range } from "@/lib/types";

export const RANGES: { value: Range; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as Range)}>
      <TabsList aria-label="Time range">
        {RANGES.map((r) => (
          <TabsTrigger key={r.value} value={r.value} className="px-3">{r.label}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
