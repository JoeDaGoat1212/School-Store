import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/*
 * The 3D city game's saved data for the signed-in player (database update 13).
 * Null when nobody's signed in, for the staff login, or before update 13 has
 * been run (then the game just saves in the browser).
 */

export type JobApplication = {
  id: string;
  business: "pizza" | "icecream" | "coffee" | "burger" | "flowers";
  status: "pending" | "hired" | "declined" | "fired" | "quit";
  level: number;
  note: string | null;
  created_at: string;
  decided_at: string | null;
};

export type GamePlayer = {
  id_number: string;
  name: string;
  since: string;
  state: Record<string, unknown>;
  applications: JobApplication[];
};

export const getGamePlayer = cache(async (): Promise<GamePlayer | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;
  const { data, error } = await supabase.rpc("get_game_player");
  if (error || !data) return null;
  return data as unknown as GamePlayer;
});
