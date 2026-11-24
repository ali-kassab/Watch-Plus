import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthCard title="Create your account" description="Start monitoring your services in minutes." footer={<>Already have an account? <Link href="/login" className="text-foreground font-medium underline-offset-4 hover:underline">Sign in</Link></>}>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
