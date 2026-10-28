"use client";

import dynamic from "next/dynamic";
import { LoadingScreen } from "./loading-screen";

/*
 * The home page's 3D store. three.js is big, so it downloads separately and
 * only in the browser (never on the server); the loading screen shows until
 * it's ready.
 */
const WorldApp = dynamic(() => import("./world-app"), { ssr: false, loading: () => <LoadingScreen /> });

export function StoreWorld(props: React.ComponentProps<typeof WorldApp>) {
  return <WorldApp {...props} />;
}
