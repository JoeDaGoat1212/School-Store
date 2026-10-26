"use client";

/**
 * Shrinks a photo in the browser before uploading it, so a 5 MB phone photo
 * becomes a ~100 KB file. Smaller files load faster on students' phones.
 *
 * Returns a square-ish WebP no wider or taller than `maxSize` pixels.
 */
export async function resizeImage(file: File, maxSize = 800): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that image."))), "image/webp", 0.85),
  );
}
