import * as React from "react";
import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
const TableHeader = ({ className, ...props }: React.ComponentProps<"thead">) => <thead className={cn("[&_tr]:border-b", className)} {...props} />;
const TableBody = ({ className, ...props }: React.ComponentProps<"tbody">) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
const TableRow = ({ className, ...props }: React.ComponentProps<"tr">) => (
  <tr className={cn("hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors", className)} {...props} />
);
const TableHead = ({ className, ...props }: React.ComponentProps<"th">) => (
  <th className={cn("text-muted-foreground h-10 px-2 text-left align-middle text-xs font-medium whitespace-nowrap", className)} {...props} />
);
const TableCell = ({ className, ...props }: React.ComponentProps<"td">) => (
  <td className={cn("p-2 align-middle whitespace-nowrap", className)} {...props} />
);

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
