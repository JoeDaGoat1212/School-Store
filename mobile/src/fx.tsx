import { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgLinear, Path, RadialGradient, Rect, Stop } from "react-native-svg";

/*
 * The app's graphics: a glowing night sky, hot ember gradients, a holographic
 * sheen, glass cards and a shift ring. Kept here so every screen looks the same.
 */

export const EMBER = ["#ffb020", "#ff5a1f", "#ff2d6f"] as const;
export const NEST = ["#a7fff3", "#2fd0c2", "#12a3ff"] as const;
export const HOLO = ["#ffb020", "#ff5a1f", "#ff2d6f", "#7c3aed"] as const;

/** Frosted glass: a see-through card with a lit top edge. */
export const glass: ViewStyle = {
  backgroundColor: "rgba(255,255,255,0.055)",
  borderColor: "rgba(255,255,255,0.10)",
  borderWidth: 1,
};

/** The sky behind every screen: ember, violet and teal glows that drift very slowly. */
export const NightSky = memo(function NightSky() {
  const { width, height } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 14000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 14000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);
  const a = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });
  const b = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });
  const w = width;
  const h = height;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#0b0c10" }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: a }, { translateY: a }] }]}>
        <Svg width={w} height={h}>
          <Defs>
            <RadialGradient id="ember" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ff5a1f" stopOpacity="0.55" />
              <Stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="teal" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#12b5a6" stopOpacity="0.32" />
              <Stop offset="1" stopColor="#12b5a6" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={w * 0.05} cy={h * 0.02} rx={w * 0.95} ry={w * 0.95} fill="url(#ember)" />
          <Ellipse cx={w * 0.2} cy={h * 1.02} rx={w * 0.9} ry={w * 0.9} fill="url(#teal)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: b }, { translateY: a }] }]}>
        <Svg width={w} height={h}>
          <Defs>
            <RadialGradient id="violet" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#7c3aed" stopOpacity="0.38" />
              <Stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={w * 1.05} cy={h * 0.48} rx={w * 0.8} ry={w * 0.8} fill="url(#violet)" />
        </Svg>
      </Animated.View>
      {/* faint dot grid near the top */}
      <Svg width={w} height={h * 0.45} style={{ position: "absolute", top: 0, opacity: 0.35 }}>
        {Array.from({ length: Math.ceil(w / 22) * Math.ceil((h * 0.45) / 22) }, (_, i) => {
          const cols = Math.ceil(w / 22);
          const x = (i % cols) * 22 + 11;
          const y = Math.floor(i / cols) * 22 + 11;
          const fade = 1 - y / (h * 0.45);
          return <Circle key={i} cx={x} cy={y} r={1} fill="#ffffff" opacity={0.12 * fade} />;
        })}
      </Svg>
    </View>
  );
});

/** A soft white sheen that sweeps across its parent every few seconds (parent needs overflow: hidden). */
export function Shine({ every = 3800, width = 120 }: { every?: number; width?: number }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(every * 0.5),
        Animated.timing(x, { toValue: 1, duration: every * 0.5, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x, every]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-width * 1.5, 520] });
  return (
    <Animated.View pointerEvents="none" style={[styles.shine, { width, transform: [{ translateX }, { skewX: "-18deg" }] }]}>
      <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.42)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** Breathing glow: scales the opacity of a colored halo behind a card. */
export function Breathe({ color, radius = 28 }: { color: string; radius?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1.5, borderColor: color, opacity }]} />;
}

/** A ring that fills toward the automatic clock-out. */
export function ShiftRing({ progress, size = 92 }: { progress: number; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Defs>
        <SvgLinear id="ring" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={NEST[0]} />
          <Stop offset="0.55" stopColor={NEST[1]} />
          <Stop offset="1" stopColor={NEST[2]} />
        </SvgLinear>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="url(#ring)"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
      />
    </Svg>
  );
}

/** The Firebirds flame, for watermarks. */
export function Flame({ size = 180, color = "#fff", opacity = 0.22 }: { size?: number; color?: string; opacity?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" style={{ opacity }}>
      <Path
        fill={color}
        d="M33 4c3 9-1 14-5 19-3 4-5 8-3 13 1-6 5-9 8-11 0 7 6 9 6 16 0 6-5 11-11 11S16 47 16 40c0-9 6-14 9-20 3-5 5-10 8-16Zm10 20c5 6 8 11 8 18 0 11-9 18-19 18 9-4 13-11 12-19 0-6-3-10-1-17Z"
      />
    </Svg>
  );
}

/** Fine diagonal lines, like a holographic card's foil. */
export function Foil({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: Math.ceil((width + height) / 10) }, (_, i) => (
        <Rect key={i} x={i * 10 - height} y={0} width={1} height={height * 2} fill="#ffffff" opacity={0.08} transform={`rotate(25 ${i * 10 - height} 0)`} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  shine: { position: "absolute", top: -40, bottom: -40, left: 0 },
});
