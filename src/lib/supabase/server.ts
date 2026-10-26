import "server-only";

// Supabase clients for code that runs on the SERVER (pages, server actions).
//
//   createClient()       → acts as the visitor (logged-in admin or anonymous
//                          student). RLS applies. Use this almost everywhere.
//   createSecretClient() → full access, skips RLS. Only for the few things the
//                          public is allowed to trigger but not do directly
//                          (placing an order). Handle with care.

import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseSecretKey, supabaseUrl } from "@/lib/env";
import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Pages can't set cookies, only server actions can. That's fine:
          // src/proxy.ts refreshes the login cookie on every request.
        }
      },
    },
  });
}

export function createSecretClient() {
  return createPlainClient<Database>(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
