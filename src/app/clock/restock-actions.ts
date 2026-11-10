"use server";

import { revalidatePath } from "next/cache";
import { addRestockPhoto, skipRestock, startRestock } from "@/lib/team";

/*
 * The restock walkthrough after clocking out (store tablet and web app):
 * a photo of each area fully stocked, checked by the manager on Team →
 * Restock checks. Proven with the clock-out's undo code, then a restock code.
 */

export async function restockBegin(shiftId: string, undoToken: string) {
  return startRestock(shiftId, undoToken);
}

export async function restockPhoto(form: FormData) {
  const file = form.get("photo");
  if (!(file instanceof File)) return { error: "Take a photo first." };
  const r = await addRestockPhoto(String(form.get("check")), String(form.get("token")), String(form.get("area")), new Uint8Array(await file.arrayBuffer()), file.type);
  if ("ok" in r) revalidatePath("/admin", "layout");
  return r;
}

export async function restockSkip(checkId: string, token: string, note: string) {
  const r = await skipRestock(checkId, token, note);
  revalidatePath("/admin", "layout");
  return r;
}
