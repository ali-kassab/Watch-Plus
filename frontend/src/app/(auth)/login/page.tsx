import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard title="Welcome back" description="Sign in to your PulseWatch account." footer={<>No account yet? <Link href="/register" className="text-foreground font-medium underline-offset-4 hover:underline">Create one</Link></>}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
