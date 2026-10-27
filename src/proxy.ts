// Runs before every page request (Next.js "proxy", formerly "middleware").
//
// Two jobs:
//   1. Keep logins fresh — the admin's and students' rewards sign-ins
//      (Supabase login cookies expire and must be refreshed; this does it).
//   2. Send anyone who isn't logged in away from /admin to /login.
//
// This is a fast first check only. Every admin page ALSO calls requireAdmin()
// (src/lib/auth.ts), and the database itself blocks non-admins with RLS.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Checks the login (and refreshes it if needed).
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);

  if (!isLoggedIn && request.nextUrl.pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Every page (students can be signed in to rewards anywhere), but not
  // images, icons and Next's own files.
  matcher: ["/((?!_next/static|_next/image|icon|apple-icon|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
