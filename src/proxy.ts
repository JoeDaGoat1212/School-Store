// Runs before every page request (Next.js "proxy", formerly "middleware").
//
// Three jobs:
//   1. Keep logins fresh — the admin's and students' rewards sign-ins
//      (Supabase login cookies expire and must be refreshed; this does it).
//   2. Send anyone who isn't logged in away from /admin to /login.
//   3. Admin-first mode (OPEN_TO_DASHBOARD below): the site's front page goes
//      straight to the dashboard, and the student storefront moves to /home.
//
// This is a fast first check only. Every admin page ALSO calls requireAdmin()
// (src/lib/auth.ts), and the database itself blocks non-admins with RLS.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// While true, opening the website goes to the admin password screen and then
// the dashboard. The student storefront is still at /home (and /menu, /store,
// etc. work as before). Set to false to make the storefront the front page again.
const OPEN_TO_DASHBOARD = true;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (OPEN_TO_DASHBOARD && pathname === "/home") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.rewrite(url);
  }

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

  // Front page: the manager goes to the dashboard; everyone else (employees
  // opening the site or its home-screen icon) goes to the employee sign-in.
  if (OPEN_TO_DASHBOARD && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = isLoggedIn ? "/admin" : "/work";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  if (!isLoggedIn && pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/admin" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Every page (students can be signed in to rewards anywhere), but not
  // images, icons and Next's own files.
  matcher: ["/((?!_next/static|_next/image|icon|apple-icon|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
