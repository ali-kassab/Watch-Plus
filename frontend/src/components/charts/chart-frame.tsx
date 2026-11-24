"use client";

import { TableIcon, BarChart3Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
}

/** Card wrapper for a chart with loading/empty states and an accessible table view toggle. */
export function ChartFrame({
  title, description, loading, empty, emptyText = "No checks recorded in this range yet.", table, children, legend,
}: {
  title: string;
  description?: string;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  table: TableView;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <Button variant="ghost" size="icon" aria-pressed={asTable} aria-label={asTable ? "Show chart" : "Show data table"} onClick={() => setAsTable((v) => !v)}>
            {asTable ? <BarChart3Icon /> : <TableIcon />}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : empty ? (
          <div className="text-muted-foreground grid h-56 place-items-center text-sm">{emptyText}</div>
        ) : asTable ? (
          <div className="max-h-56 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>{table.columns.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((r, i) => (
                  <TableRow key={i}>{r.map((v, j) => <TableCell key={j} className="tabular-nums">{v}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <>
            {legend}
            {children}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span className="h-0.5 w-3 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
