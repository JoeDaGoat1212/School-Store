import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getToken, loadPortal, type Portal, SignedOut } from "./src/api";
import { Home } from "./src/home";
import { SignIn } from "./src/sign-in";
import { useColors } from "./src/theme";

/*
 * Firebirds Nest staff app. Employees sign in once with their name and time
 * clock PIN, then clock in and out, see their discount, store credit and
 * schedule. Everything comes from the school store website's phone API.
 */
export default function App() {
  const c = useColors();
  const [phase, setPhase] = useState<"loading" | "out" | "in">("loading");
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await loadPortal();
      setData(d);
      setError(null);
      setPhase("in");
    } catch (e) {
      if (e instanceof SignedOut) {
        setData(null);
        setPhase("out");
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setPhase((p) => (p === "loading" ? "in" : p));
      }
    }
  }, []);

  // On start: signed in already? Then load.
  useEffect(() => {
    getToken().then((t) => (t ? refresh() : setPhase("out")));
  }, [refresh]);

  // Keep it current: every 30 seconds while open, and whenever the app comes back.
  useEffect(() => {
    if (phase !== "in") return;
    const timer = setInterval(refresh, 30000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [phase, refresh]);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <View style={[styles.fill, { backgroundColor: c.board }]}>
        {phase === "loading" ? (
          <View style={[styles.fill, styles.center]}>
            <ActivityIndicator color={c.muted} />
          </View>
        ) : phase === "out" ? (
          <SignIn onSignedIn={refresh} />
        ) : (
          <Home
            data={data}
            error={error}
            onRefresh={refresh}
            onSignedOut={() => {
              setData(null);
              setPhase("out");
            }}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
});
