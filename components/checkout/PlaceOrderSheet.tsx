// components/checkout/PlaceOrderSheet.tsx
import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  Animated,
  Easing,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const PRIMARY = "#111827";
const MUTED   = "#6B7280";
const TRACK   = "#E5E7EB";
const GREEN   = "#16A34A";

type Props = {
  visible: boolean;
  amount: number;                 // total payable
  methodLabel: string;            // e.g. "Pay ₹231 on delivery (UPI/cash)"
  addressTitle: string;           // e.g. "Delivering to Home"
  addressLine: string;            // e.g. "NIT Gate-2, Hamirpur, Himachal Pradesh…"
  onCancel: () => void;
  onDone: () => void;
  durationMs?: number;            // default 5000
};

export default function PlaceOrderSheet({
  visible,
  amount,
  methodLabel,
  addressTitle,
  addressLine,
  onCancel,
  onDone,
  durationMs = 5000,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(40)).current; // translateY
  const fade = useRef(new Animated.Value(0)).current;   // backdrop

  useEffect(() => {
    let finished = false;

    if (visible) {
      progress.setValue(0);
      slide.setValue(40);
      fade.setValue(0);

      // animate in
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 200, easing: Easing.linear, useNativeDriver: true }),
      ]).start();

      // progress fill (no numbers)
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false, // width animation
      }).start(({ finished: ok }) => {
        finished = ok;
        if (ok) onDone();
      });
    }

    return () => {
      if (!finished) {
        // stop animations if sheet closes early
        progress.stopAnimation();
        slide.stopAnimation();
        fade.stopAnimation();
      }
    };
  }, [visible]);

  const widthInterpolate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fade }]} />
      {/* Touch lock (don’t dismiss by tapping backdrop) */}
      <TouchableWithoutFeedback>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slide }] }]}>
          <Text style={styles.title}>Placing your order</Text>

          {/* Payment row */}
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <Ionicons name="card-outline" size={16} color={PRIMARY} />
            </View>
            <Text style={styles.rowText}>{methodLabel}</Text>
          </View>

          {/* Address row */}
          <View style={[styles.row, { marginTop: 8 }]}>
            <View style={styles.iconBox}>
              <Ionicons name="home-outline" size={16} color={PRIMARY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>{addressTitle}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{addressLine}</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, { width: widthInterpolate }]} />
          </View>

          {/* Cancel */}
          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} activeOpacity={0.85}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fff",
  },
  title: { fontSize: 18, fontWeight: "900", color: PRIMARY, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  iconBox: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: "#F3F4F6",
    alignItems: "center", justifyContent: "center", marginRight: 10,
  },
  rowText: { fontWeight: "800", color: PRIMARY },
  rowSub: { color: MUTED, fontWeight: "700", marginTop: 2 },
  barTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: TRACK,
    overflow: "hidden",
    marginTop: 16,
  },
  barFill: {
    height: "100%",
    backgroundColor: GREEN,
    borderRadius: 999,
  },
  cancelBtn: { alignSelf: "flex-end", paddingVertical: 10 },
  cancelText: { color: GREEN, fontWeight: "900" },
});
