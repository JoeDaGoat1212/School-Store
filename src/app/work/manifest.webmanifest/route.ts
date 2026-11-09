import { brand } from "@/config/brand";

/**
 * Makes /work installable as an app ("Install app" on Android and computers,
 * "Add to Home Screen" on iPhone). Only the employee app links to this, so
 * students browsing the store don't get asked to install it.
 */
export function GET() {
  return Response.json(
    {
      name: `${brand.name} Work`,
      short_name: "FN Work",
      description: "Clock in and out, and see your hours, discount and store credit.",
      id: "/work",
      start_url: "/work",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: brand.colors.ink,
      theme_color: brand.colors.ink,
      icons: [
        { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
