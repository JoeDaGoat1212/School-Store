import { memo } from "react";
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/*
 * The app's graphics: a dark dot-grid sky, solid Firebirds orange and nest
 * teal, crisp cards, a striped pass and the shift ring. No glows, no rainbows.
 */

// Solid brand colors (no rainbows): passed to LinearGradient as two equal stops.
export const EMBER = ["#ff5a1f", "#ff5a1f"] as const;
export const NEST = ["#2fd0c2", "#2fd0c2", "#2fd0c2"] as const;

/** A card: solid dark with a crisp edge. */
export const glass: ViewStyle = {
  backgroundColor: "#17191e",
  borderColor: "#262a31",
  borderWidth: 1,
};

/** Behind every screen: near-black with a faint dot grid at the top. */
export const NightSky = memo(function NightSky() {
  const { width: w, height: h } = useWindowDimensions();
  const cols = Math.ceil(w / 22);
  const rows = Math.ceil((h * 0.4) / 22);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#0e0f12" }]}>
      {/* faint dot grid that fades out down the screen */}
      <Svg width={w} height={h * 0.4} style={{ position: "absolute", top: 0 }}>
        {Array.from({ length: cols * rows }, (_, i) => {
          const x = (i % cols) * 22 + 11;
          const y = Math.floor(i / cols) * 22 + 11;
          return <Circle key={i} cx={x} cy={y} r={1} fill="#ffffff" opacity={0.08 * (1 - y / (h * 0.4))} />;
        })}
      </Svg>
    </View>
  );
});

/** A ring that fills toward the automatic clock-out. */
export function ShiftRing({ progress, size = 92 }: { progress: number; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#2fd0c2"
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
export function Flame({ size = 180, color = "#000", opacity = 0.12 }: { size?: number; color?: string; opacity?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" style={{ opacity }}>
      <Path
        fill={color}
        d="M33 4c3 9-1 14-5 19-3 4-5 8-3 13 1-6 5-9 8-11 0 7 6 9 6 16 0 6-5 11-11 11S16 47 16 40c0-9 6-14 9-20 3-5 5-10 8-16Zm10 20c5 6 8 11 8 18 0 11-9 18-19 18 9-4 13-11 12-19 0-6-3-10-1-17Z"
      />
    </Svg>
  );
}

/** Bold diagonal stripes for the pass. */
export function Foil({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: Math.ceil((width + height * 2) / 28) }, (_, i) => (
        <Rect key={i} x={i * 28 - height} y={0} width={14} height={height * 2} fill="#000000" opacity={0.07} transform={`rotate(45 ${i * 28 - height} 0)`} />
      ))}
    </Svg>
  );
}

