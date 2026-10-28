import { notFound } from "next/navigation";
import { RenderStudio } from "./render-studio";

/**
 * Only while developing: a little photo studio that draws one product's 3D
 * model on a see-through background, so a script can save it as the product
 * picture (public/products/3d/<slug>.webp). See scripts/render-products.mjs.
 *
 * Open /dev/renders?slug=coke to see one.
 */
export default async function RendersPage(props: PageProps<"/dev/renders">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { slug } = await props.searchParams;
  return <RenderStudio slug={typeof slug === "string" ? slug : "coke"} />;
}
