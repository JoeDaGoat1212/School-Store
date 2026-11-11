import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { EMBER } from "./fx";
import { type Colors, radius } from "./theme";

const HOLD_MS = 600;

/**
 * "Hold to clock in": press and hold, a fill sweeps across, the phone buzzes,
 * and it fires. Letting go early cancels, so a pocket tap never clocks anyone
 * in or out.
 */
export function HoldButton({ on, busy, c, onComplete }: { on: boolean; busy: boolean; c: Colors; onComplete: () => void }) {
  const fill = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!busy) {
      Animated.timing(fill, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }
  }, [busy, fill]);

  const start = () => {
    if (busy) return;
    setHolding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    anim.current = Animated.timing(fill, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false });
    anim.current.start(({ finished }) => {
      setHolding(false);
      if (finished) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        onComplete();
      }
    });
  };

  const cancel = () => {
    if (!anim.current) return;
    anim.current.stop();
    anim.current = null;
    setHolding(false);
    Animated.timing(fill, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const label = busy ? (on ? "Clocking out…" : "Clocking in…") : holding ? "Keep holding…" : on ? "Hold to clock out" : "Hold to clock in";

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={on ? "Hold to clock out" : "Hold to clock in"}
      style={[styles.button, { backgroundColor: on ? "rgba(255,255,255,0.08)" : "transparent", borderColor: on ? "rgba(255,255,255,0.25)" : "#ff5a1f" }]}
    >
      {!on && <LinearGradient colors={[...EMBER]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      <Animated.View style={[StyleSheet.absoluteFill, { width, backgroundColor: on ? "#ffffff" : "#0b0b0b" }]} />
      <View style={styles.row}>
        {busy && <ActivityIndicator color={on ? "#fff" : "#000"} />}
        <Text style={[styles.label, { color: on ? (holding ? "#000" : "#fff") : holding ? "#ff5a1f" : "#0b0b0b" }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { height: 70, borderRadius: radius.card, overflow: "hidden", borderWidth: 1, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  label: { fontSize: 20, fontWeight: "900", letterSpacing: 0.3 },
});
