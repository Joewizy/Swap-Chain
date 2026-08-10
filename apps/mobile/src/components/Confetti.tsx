// A subtle, one-shot confetti burst for the payout / transfer hero cards.
// Pieces are randomized once (so re-renders don't re-scatter them), animate via
// the native driver, and are skipped entirely when Reduce Motion is on. Render
// it as the first child of a `position: relative`, `overflow: hidden` card.
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from "react-native";
import { theme } from "@/theme";

// Warm, desaturated brand palette — never candy-bright.
const COLORS = [
  theme.colors.accent,
  theme.colors.ok,
  theme.colors.pend,
  "#C9A23F",
];

type Piece = {
  left: number; // percent
  dx: number; // horizontal drift, px
  rot: number; // final rotation, deg
  delay: number; // ms
  color: string;
  w: number;
  h: number;
};

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    left: 6 + Math.random() * 84,
    dx: -70 + Math.random() * 140,
    rot: 200 + Math.random() * 340,
    delay: Math.random() * 260,
    color: COLORS[i % COLORS.length],
    w: 5 + Math.round(Math.random() * 4),
    h: 9 + Math.round(Math.random() * 5),
  }));
}

export function Confetti({
  count = 14,
  fall = 260,
}: {
  count?: number;
  /** How far pieces fall before fading, in px. */
  fall?: number;
}) {
  const [pieces] = useState(() => makePieces(count));
  const [enabled, setEnabled] = useState(true);
  const progress = useRef(pieces.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!active) return;
        if (reduce) {
          setEnabled(false);
          return;
        }
        Animated.parallel(
          pieces.map((p, i) =>
            Animated.timing(progress[i], {
              toValue: 1,
              duration: 1600,
              delay: p.delay,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            })
          )
        ).start();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled) return null;

  return (
    <View pointerEvents="none" style={styles.layer}>
      {pieces.map((p, i) => {
        const translateY = progress[i].interpolate({
          inputRange: [0, 1],
          outputRange: [-12, fall],
        });
        const translateX = progress[i].interpolate({
          inputRange: [0, 1],
          outputRange: [0, p.dx],
        });
        const rotate = progress[i].interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", `${p.rot}deg`],
        });
        const opacity = progress[i].interpolate({
          inputRange: [0, 0.12, 0.82, 1],
          outputRange: [0, 1, 1, 0],
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              top: 6,
              left: `${p.left}%`,
              width: p.w,
              height: p.h,
              borderRadius: 2,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateX }, { translateY }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
});
