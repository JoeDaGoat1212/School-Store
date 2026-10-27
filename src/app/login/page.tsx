import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { brand } from "@/config/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff login" };

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
          <div>
            <h1 className="font-heading text-4xl leading-none font-extrabold">Staff login</h1>
            <p className="mt-1 text-sm text-muted-foreground">{brand.name} dashboard</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <LoginForm next={next} initialError={error} />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Looking for snacks?{" "}
          <Link href="/" className="font-medium text-ember-ink underline-offset-4 hover:underline">
            Go to the menu
          </Link>
        </p>
      </div>
    </main>
  );
}
