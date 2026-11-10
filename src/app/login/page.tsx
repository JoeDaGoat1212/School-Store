import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { brand } from "@/config/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : "/admin";
  const error = params.error === "not-admin" ? "This account isn't the store admin." : undefined;

  return (
    <main className="relative grid min-h-dvh place-items-center bg-background px-4 py-12">
      <ThemeToggle className="absolute top-4 right-4" />

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <BrandMark size={52} />
          <h1 className="font-heading text-3xl leading-none font-bold">{brand.name}</h1>
        </div>

        <Link
          href="/work"
          className="flex items-center gap-3 rounded-xl bg-foreground px-5 py-4 text-background transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="flex-1">
            <span className="block text-lg font-semibold">Employee sign in</span>
            <span className="block text-sm opacity-75">Use your name and the PIN you clock in with</span>
          </span>
          <ArrowRightIcon aria-hidden className="size-5" />
        </Link>

        <div className="mt-8 rounded-xl border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Manager sign in</h2>
          <LoginForm next={next} initialError={error} />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Looking for snacks?{" "}
          <Link href="/home" className="font-medium text-ember-ink underline-offset-4 hover:underline">
            Go to the menu
          </Link>
        </p>
      </div>
    </main>
  );
}
