"use client";

/** Shared Recharts tooltip body: text uses text tokens; a colored key beside each value carries identity. */
export function ChartTooltip({
  active, label, rows,
}: {
  active?: boolean;
  label?: string;
  rows: { color?: string; name: string; value: string }[];
}) {
  if (!active) return null;
  return (
    <div className="bg-popover text-popover-foreground min-w-36 rounded-md border px-3 py-2 text-xs shadow-md">
      {label && <div className="text-muted-foreground mb-1">{label}</div>}
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />}
            {r.name}
          </span>
          <span className="font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
