import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const PRIMARY = "#111827";
const BORDER = "#E5E7EB";
const RED = "#DC2626";

export default function CountdownSheet({
  visible, seconds = 10, onCancel, onDone,
}: { visible: boolean; seconds?: number; onCancel: () => void; onDone: () => void; }) {
  const [count, setCount] = useState(seconds);
  const slideY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (!visible) return;
    setCount(seconds);
    Animated.timing(slideY, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const t = setInterval(() => setCount((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [visible]);

  useEffect(() => {
    if (visible && count === 0) onDone();
  }, [count, visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
          <Ionicons name="timer-outline" size={24} color={PRIMARY} />
          <Text style={styles.title}>Placing order in</Text>
          <Text style={styles.count}>{count}</Text>
          <TouchableOpacity onPress={onCancel} style={[styles.cancel, { backgroundColor: RED }]}>
  <Text style={{ color: "#fff", fontWeight: "900" }}>Cancel</Text>
</TouchableOpacity>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", padding: 18, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1, borderColor: BORDER, alignItems: "center", gap: 8 },
  title: { fontWeight: "800", fontSize: 16 },
  count: { fontWeight: "900", fontSize: 36, marginVertical: 6 },
  cancel: { backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, marginTop: 6 },
});
