"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { GamePlayer } from "@/lib/game";

/*
 * Saving the 3D city game for signed-in players, and job applications
 * (database update 13). Everything here only touches the player's own data;
 * the database checks that.
 */

const JOBS = ["pizza", "icecream", "coffee", "burger", "flowers"] as const;

/** Save the game. Quietly does nothing if nobody's signed in. */
export async function saveGame(state: Record<string, unknown>) {
  const supabase = await createClient();
  const json = JSON.stringify(state);
  if (json.length > 30000) return { error: "Save too big" };
  const { error } = await supabase.rpc("save_game_state", { p_state: JSON.parse(json) as Json });
  return error ? { error: error.message } : { ok: true };
}

/** The player's latest saved game and job applications (to see if they've been hired). */
export async function refreshGame() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_game_player");
  if (error || !data) return null;
  return data as unknown as GamePlayer;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Send a résumé to one of the city's shops. */
export async function applyForJob(business: string, answers: Record<string, unknown>) {
  if (!JOBS.includes(business as (typeof JOBS)[number])) return { error: "That shop isn't hiring." };
  const clean = {
    name: text(answers.name, 60),
    position: text(answers.position, 40),
    why: text(answers.why, 400),
    experience: text(answers.experience, 400),
    skills: Array.isArray(answers.skills) ? answers.skills.filter((s): s is string => typeof s === "string").slice(0, 8).map((s) => s.slice(0, 30)) : [],
    availability: text(answers.availability, 60),
    reference: text(answers.reference, 80),
  };
  if (!clean.name || clean.why.length < 10) return { error: "Fill in your name and why you want the job (a sentence or two)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_for_job", { p_business: business, p_answers: clean as Json });
  if (error) return { error: error.hint ?? error.message };
  revalidatePath("/admin/jobs");
  return { ok: true };
}

/** Quit, or get fired by the game. */
export async function leaveJob(business: string, reason: "quit" | "fired") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_job", { p_business: business, p_reason: reason });
  revalidatePath("/admin/jobs");
  return error ? { error: error.message } : { ok: true };
}

/** A promotion. */
export async function recordJobLevel(business: string, level: number) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_job_level", { p_business: business, p_level: level });
  return error ? { error: error.message } : { ok: true };
}
