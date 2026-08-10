// The celebratory checkmark for success/hero cards: a green badge inside a soft
// halo that springs in on mount. Falls back to a static badge under Reduce
// Motion. Shared by Buy and Sell so the two moments feel the same.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { theme } from "@/theme";

export function SuccessCheck({ size = 76 }: { size?: number }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!active) return;
        if (reduce) {
          setReduced(true);
          scale.setValue(1);
          opacity.setValue(1);
          return;
        }
        Animated.parallel([
          Animated.spring(scale, {
            toValue: 1,
            friction: 5,
            tension: 140,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inner = Math.round(size * 0.71);
  return (
    <Animated.View
      style={[
        styles.halo,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: reduced ? 1 : opacity,
          transform: [{ scale: reduced ? 1 : scale }],
        },
      ]}
    >
      <View
        style={[
          styles.badge,
          { width: inner, height: inner, borderRadius: inner / 2 },
        ]}
      >
        <Feather
          name="check"
          size={Math.round(inner * 0.5)}
          color={theme.colors.surface}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  halo: {
    backgroundColor: theme.colors.okSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    backgroundColor: theme.colors.ok,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.ok,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 4,
  },
});
