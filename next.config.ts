import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is OFF on purpose. Almost every page here shows live data
  // (orders, stock), so pages just run fresh on each visit. That's simpler to
  // reason about for a student team than caching rules and Suspense boundaries.
  cacheComponents: false,
  partialPrefetching: false,

  images: {
    // Product photos come from Supabase Storage.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
