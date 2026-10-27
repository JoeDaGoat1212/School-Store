"use client";

import { useEffect } from "react";
import type { Scene } from "@/lib/product-look";
import { cn } from "@/lib/utils";
import { backdropUrl } from "./scene-assets";

/**
 * The photo behind a drink in the showcase (strawberries and a red splash for
 * a strawberry drink, and so on).
 *
 * The photos are wide, with the fruit on the left and right edges. On a wide
 * screen the whole photo fills the stage. On a tall phone screen that would
 * cut the fruit off, so the photo is split in two: its left half sits at the
 * top of the screen and its right half at the bottom, fading into the color
 * in between.
 */
export function SceneBackdrop({ scene, className }: { scene: Scene; className?: string }) {
  const url = `url(${backdropUrl(scene)})`;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {/* Wide screens: the whole photo */}
      <div className="absolute inset-0 bg-cover bg-center portrait:hidden" style={{ backgroundImage: url }} />

      {/* Tall screens: left half on top, right half at the bottom */}
      <div
        className="absolute inset-x-0 top-0 hidden aspect-[8/9] bg-[length:200%_auto] bg-left-top bg-no-repeat portrait:block"
        style={{ backgroundImage: url, maskImage: "linear-gradient(to bottom, #000 55%, transparent)" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 hidden aspect-[8/9] bg-[length:200%_auto] bg-right-bottom bg-no-repeat portrait:block"
        style={{ backgroundImage: url, maskImage: "linear-gradient(to top, #000 55%, transparent)" }}
      />
    </div>
  );
}

/** Start downloading the backdrops of the drinks next to this one, so swiping doesn't wait. */
export function usePreloadBackdrops(scenes: (Scene | undefined)[]) {
  const key = scenes.filter(Boolean).join(",");
  useEffect(() => {
    for (const scene of key.split(",")) {
      if (scene) new Image().src = backdropUrl(scene as Scene);
    }
  }, [key]);
}
