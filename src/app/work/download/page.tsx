import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeftIcon, DownloadIcon } from "lucide-react";
import { ANDROID_APP_URL, APK_SIZE_MB } from "../app-link";
import { CopyLink } from "./copy-link";

export const metadata: Metadata = { title: "Get the Firebird Store app" };

const STEPS = [
  { title: "Tap Download", body: `It's about ${APK_SIZE_MB} MB. If Chrome says the file might be harmful, tap Download anyway. It's the store's own app.` },
  { title: "Open the file", body: "When it finishes, tap Open (or open firebirds-nest-staff.apk from your notifications or the Downloads folder)." },
  { title: "Allow installs from Chrome", body: "The first time, Android asks you to allow apps from this source. Tap Settings, turn on Allow from this source, then go back." },
  { title: "Tap Install", body: "Then open Firebirds Nest and sign in with your name and PIN. Already have the app? Installing again updates it." },
];

const IPHONE_STEPS = [
  { title: "Tap Open the app", body: "Below. It opens the employee app here in Safari (it has to be Safari, not Chrome)." },
  { title: "Tap the Share button", body: "The square with an arrow pointing up, at the bottom of the screen." },
  { title: "Tap Add to Home Screen", body: "Scroll down the list to find it, then tap Add. Use the new icon on your home screen from now on." },
  { title: "Sign in", body: "Your name and your 4-digit store PIN. Then tap Turn on notifications so you get messages and reminders." },
];

/** The iPhone steps: the app is the website, added to the home screen. */
function IphoneSteps() {
  return (
    <section className="glass grid gap-3 rounded-2xl p-4">
      <h2 className="text-lg font-semibold">On an iPhone</h2>
      <ol className="grid gap-2.5">
        {IPHONE_STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.08] font-heading text-base font-bold">{i + 1}</span>
            <span>
              <span className="block font-semibold">{s.title}</span>
              <span className="block text-sm text-muted-foreground">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <Link href="/work" className="ember flex h-12 items-center justify-center rounded-xl font-bold">
        Open the app
      </Link>
    </section>
  );
}

/**
 * Downloading the Android app, step by step. Its own page (not a button in the
 * app header) so it works from the home-screen version of the site too.
 */
export default async function DownloadPage() {
  const iphone = /iphone|ipad|ipod/i.test((await headers()).get("user-agent") ?? "");
  return (
    <div className="dark night relative isolate min-h-svh bg-background px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-12">
      <div aria-hidden className="night-sky -z-10">
        <i />
        <s />
        <b />
      </div>
      <main className="relative mx-auto grid max-w-md gap-5">
        <Link href="/work" className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Back
        </Link>
        <div>
          <h1 className="font-heading text-6xl leading-[0.9] font-bold">
            Get the <span className="text-ember">app</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {iphone ? "On iPhone, the app is added to your home screen from Safari." : "Android: download and install it below. iPhone: see the steps further down."}
          </p>
        </div>

        {iphone ? (
          <IphoneSteps />
        ) : (
          <>
        <a
          href={ANDROID_APP_URL}
          target="_blank"
          rel="noopener"
          className="ember flex h-16 items-center justify-center gap-2.5 rounded-2xl text-lg font-extrabold transition active:scale-[0.985]"
        >
          <DownloadIcon className="size-5" /> Download ({APK_SIZE_MB} MB)
        </a>

        <ol className="grid gap-2.5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="glass flex gap-4 rounded-2xl p-4">
              <span className="ember grid size-9 shrink-0 place-items-center rounded-xl font-heading text-xl font-bold">{i + 1}</span>
              <span>
                <span className="block font-semibold">{s.title}</span>
                <span className="block text-sm text-muted-foreground">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>

        <section className="glass grid gap-3 rounded-2xl p-4">
          <h2 className="font-semibold">Still nothing happens?</h2>
          <p className="text-sm text-muted-foreground">
            Some apps (like Instagram or a school app) open links in their own browser, which can&apos;t install apps. Copy the link and paste it into Chrome.
          </p>
          <CopyLink url={ANDROID_APP_URL} />
          <p className="text-sm text-muted-foreground">
            &ldquo;App not installed&rdquo;? Delete the old Firebirds Nest app first, then install again.
          </p>
        </section>

        <IphoneSteps />
          </>
        )}
      </main>
    </div>
  );
}
