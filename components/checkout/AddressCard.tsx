import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const PRIMARY = "#111827";
const MUTED   = "#6B7280";
const BORDER  = "#E5E7EB";
const CARD_BG = "#F9FAFB";
const ACCENT  = "#FE8C00";

export type Address = {
  $id: string;
  fullName: string;
  phone: string;
  line1: string;
  landmark?: string;
  pincode: string;
  city: string;
  state: string;
  country: string;
  isDefault: boolean;
};

export default function AddressCard({
  a,
  selected,
  onPress,
  onMakeDefault,
  onEdit,          // <-- back
  onDelete,        // <-- stays
}: {
  a: Address;
  selected: boolean;
  onPress: () => void;
  onMakeDefault: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        styles.card,
        selected && { borderColor: PRIMARY, backgroundColor: CARD_BG },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={[styles.iconCircle, selected && { backgroundColor: PRIMARY }]}>
          <Ionicons name="location-outline" size={18} color={selected ? "#fff" : PRIMARY} />
        </View>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontWeight: "900", color: PRIMARY }} numberOfLines={1}>
            {a.fullName} • {a.phone}
          </Text>
          <Text style={{ color: MUTED, fontWeight: "700", marginTop: 4 }} numberOfLines={2}>
            {a.line1}{a.landmark ? `, ${a.landmark}` : ""}, {a.city}, {a.state}, {a.country} - {a.pincode}
          </Text>

          <View style={styles.actionsRow}>
            {a.isDefault ? (
              <View style={styles.defaultPill}><Text style={styles.defaultText}>DEFAULT</Text></View>
            ) : (
              <TouchableOpacity onPress={onMakeDefault} style={styles.makeDefaultBtn}>
                <Text style={styles.makeDefaultText}>Set default</Text>
              </TouchableOpacity>
            )}

            {/* Edit button (optional) */}
            {onEdit ? (
              <TouchableOpacity onPress={onEdit} style={styles.editBtn}>
                <Ionicons name="create-outline" size={14} color="#1D4ED8" />
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
            ) : null}

            {/* Delete button (optional) */}
            {onDelete ? (
              <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={14} color="#B91C1C" />
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={PRIMARY} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },

  /* Default pill */
  defaultPill: { backgroundColor: "#ECFDF5", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 8 },
  defaultText: { color: "#065F46", fontWeight: "900", fontSize: 11 },

  /* Make default */
  makeDefaultBtn: { backgroundColor: ACCENT, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 8 },
  makeDefaultText: { color: "#fff", fontWeight: "900", fontSize: 11 },

  /* Edit */
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    marginRight: 8,
  },
  editText: { color: "#1D4ED8", fontWeight: "900", fontSize: 11, marginLeft: 6 },

  /* Delete */
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  deleteText: { color: "#B91C1C", fontWeight: "900", fontSize: 11, marginLeft: 6 },
});
