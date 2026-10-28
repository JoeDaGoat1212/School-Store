/** "Mountain Dew (Baja Blast)" -> "mountain-dew-baja-blast": how a product's name finds its 3D model and pictures. */
export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
