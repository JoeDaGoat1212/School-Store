import { brandIcon } from "@/lib/brand-icon";

/** The employee app's home-screen icons (192 and 512 pixels), drawn from the logo. */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (size !== 192 && size !== 512) return new Response("Not found", { status: 404 });
  const image = brandIcon(size);
  return new Response(image.body, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
