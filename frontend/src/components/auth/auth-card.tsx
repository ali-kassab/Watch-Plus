import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({ title, description, children, footer }: { title: string; description: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Logo className="mb-8" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      <p className="text-muted-foreground mt-6 text-sm">{footer}</p>
      <Link href="/" className="text-muted-foreground hover:text-foreground mt-2 text-xs">← Back to home</Link>
    </div>
  );
}
