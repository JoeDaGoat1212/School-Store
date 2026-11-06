"use client";

/**
 * Reads the text off an End of Period Summary that's a PDF or a photo, so the
 * numbers can be pulled out with no typing.
 *
 *   PDF    → pdf.js reads the text that's in the file.
 *   Photo  → Tesseract reads the printed words (OCR) right in the browser.
 *
 * Both are loaded from a CDN only when a PDF or photo is dropped, so the page
 * stays fast the rest of the time. The words are put back into lines top to
 * bottom, the way they sit on the page, for parseEopRows() to read.
 */

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js";

// Loads a module from a URL at runtime (kept out of the site's own bundle).
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importUrl = new Function("url", "return import(url)") as (url: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
export const isImage = (f: File) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(f.name);

/** One word or bit of text and where it sits on the page (y grows downward). */
type Piece = { text: string; x: number; y: number; h: number };

/** Puts words back into lines: same height on the page = same line, then left to right. */
function toLines(pieces: Piece[]) {
  const sorted = pieces.filter((p) => p.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Piece[][] = [];
  for (const p of sorted) {
    const line = lines.at(-1);
    // Only words that sit really level count as one line. Printed reports
    // put some amounts half a line below their label; keeping those apart
    // lets the label get the right amount.
    if (line && Math.abs(line[0].y - p.y) <= Math.max(1.5, Math.min(line[0].h, p.h) * 0.3)) line.push(p);
    else lines.push([p]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x).map((p) => p.text.trim()).join("  "));
}

/** All the text from a PDF, as lines. */
async function readPdf(file: File) {
  const pdfjs = await importUrl(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const pieces: Piece[] = content.items
      .filter((i: { str?: string }) => typeof i.str === "string")
      .map((i: { str: string; transform: number[]; height: number }) => ({
        text: i.str,
        x: i.transform[4],
        y: height - i.transform[5], // PDF measures from the bottom; flip it
        h: i.height || Math.abs(i.transform[3]) || 10,
      }));
    out.push(...toLines(pieces));
  }
  await doc.destroy?.();
  return out;
}

/** All the printed text in a photo, as lines (OCR). */
async function readPhoto(file: File) {
  if (/\.(heic|heif)$/i.test(file.name) || /heic|heif/.test(file.type)) {
    throw new Error("iPhone HEIC photos can't be read in the browser. Take a screenshot of the photo, or set the camera to \"Most Compatible\" (JPG), and drop that.");
  }
  const { createWorker } = await importUrl(TESSERACT);
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(file);
    type Word = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
    const words: Word[] = data.words ?? [];
    if (words.length === 0) return String(data.text ?? "").split("\n");
    return toLines(
      words.map((w) => ({ text: w.text, x: w.bbox.x0, y: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0 })),
    );
  } finally {
    await worker.terminate();
  }
}

/** Reads a PDF or photo of a report into rows (one line of text per row). */
export async function readReport(file: File): Promise<string[][]> {
  const lines = isPdf(file) ? await readPdf(file) : await readPhoto(file);
  if (lines.join("").trim() === "") {
    throw new Error(isPdf(file) ? "That PDF has no readable text in it. Try a photo or screenshot of it instead." : "Couldn't read any text in that photo. Try a sharper, straight-on picture.");
  }
  return lines.map((l) => [l]);
}
