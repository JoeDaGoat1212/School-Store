/**
 * Product photos live in the public "product-photos" Supabase Storage bucket.
 * The database only stores the file's path (e.g. "products/abc123.webp").
 */

export const PHOTO_BUCKET = "product-photos";

/** Turns a stored photo path into a full web address, or null if there's no photo. */
export function productPhotoUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

/** Receipts live in the PRIVATE "receipts" bucket: only the admin can open them. */
export const RECEIPT_BUCKET = "receipts";
