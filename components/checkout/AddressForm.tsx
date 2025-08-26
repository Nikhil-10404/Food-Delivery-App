// components/checkout/AddressForm.tsx
import React, { useMemo, useState, memo } from "react";
import { View, Text, TextInput, StyleSheet, Platform, Switch, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const PRIMARY = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const BLUE = "#2563EB";

export type AddressInput = {
  fullName: string; phone: string; line1: string; landmark?: string;
  pincode: string; city: string; state: string; country: string; isDefault: boolean;
};

function AddressFormBase({
  initial,
  onSubmit,
  submitting,
  mode = "create",
  submitLabel,
}: {
  initial?: Partial<AddressInput>;
  onSubmit: (a: AddressInput | Partial<AddressInput>) => void | Promise<void>;// <-- allow partial on edit
  submitting?: boolean;
  mode?: "create" | "edit";
  submitLabel?: string;
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [line1, setLine1] = useState(initial?.line1 ?? "");
  const [landmark, setLandmark] = useState(initial?.landmark ?? "");
  const [pincode, setPincode] = useState(initial?.pincode ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [stateName, setStateName] = useState(initial?.state ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);

  // Create-mode validation (all required)
  const createValid =
    fullName.trim().length >= 2 &&
    /^\d{10}$/.test(phone.trim()) &&
    line1.trim().length >= 4 &&
    pincode.trim().length >= 4 &&
    !!city.trim() && !!stateName.trim() && !!country.trim();

  // Edit-mode: at least one field changed
  const editChanged = useMemo(() => {
    const i = initial || {};
    return (
      (fullName !== (i.fullName ?? "")) ||
      (phone !== (i.phone ?? "")) ||
      (line1 !== (i.line1 ?? "")) ||
      (landmark !== (i.landmark ?? "")) ||
      (pincode !== (i.pincode ?? "")) ||
      (city !== (i.city ?? "")) ||
      (stateName !== (i.state ?? "")) ||
      (country !== (i.country ?? "")) ||
      (isDefault !== (i.isDefault ?? false))
    );
  }, [initial, fullName, phone, line1, landmark, pincode, city, stateName, country, isDefault]);

  // Build partial diff for edit
  const partialDiff: Partial<AddressInput> = useMemo(() => {
    const i = initial || {};
    const diff: Partial<AddressInput> = {};
    if (fullName !== (i.fullName ?? "")) diff.fullName = fullName.trim();
    if (phone !== (i.phone ?? "")) diff.phone = phone.trim();
    if (line1 !== (i.line1 ?? "")) diff.line1 = line1.trim();
    if (landmark !== (i.landmark ?? "")) diff.landmark = landmark.trim();
    if (pincode !== (i.pincode ?? "")) diff.pincode = pincode.trim();
    if (city !== (i.city ?? "")) diff.city = city.trim();
    if (stateName !== (i.state ?? "")) diff.state = stateName.trim();
    if (country !== (i.country ?? "")) diff.country = country.trim();
    if (isDefault !== (i.isDefault ?? false)) diff.isDefault = isDefault;
    return diff;
  }, [initial, fullName, phone, line1, landmark, pincode, city, stateName, country, isDefault]);

  const canSubmit = mode === "edit" ? editChanged : createValid;
  const buttonText = submitLabel || (mode === "edit" ? "Update Address" : "Save Address");

  const doSubmit = () => {
    if (mode === "edit") {
      onSubmit(partialDiff); // only changed fields
    } else {
      onSubmit({
        fullName: fullName.trim(),
        phone: phone.trim(),
        line1: line1.trim(),
        landmark: landmark.trim(),
        pincode: pincode.trim(),
        city: city.trim(),
        state: stateName.trim(),
        country: country.trim(),
        isDefault,
      });
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View style={[styles.flex, { marginRight: 10 }]}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput value={fullName} onChangeText={setFullName} placeholder="Your name" placeholderTextColor={MUTED} style={styles.input} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.label}>Phone *</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="10-digit" placeholderTextColor={MUTED} style={styles.input} keyboardType="phone-pad" maxLength={10} />
        </View>
      </View>

      <Text style={styles.label}>Address Line 1 *</Text>
      <TextInput value={line1} onChangeText={setLine1} placeholder="House / Street / Area" placeholderTextColor={MUTED} style={styles.input} />

      <Text style={styles.label}>Landmark (optional)</Text>
      <TextInput value={landmark} onChangeText={setLandmark} placeholder="Near..." placeholderTextColor={MUTED} style={styles.input} />

      <View style={styles.row}>
        <View style={[styles.flex, { marginRight: 10 }]}>
          <Text style={styles.label}>Pincode *</Text>
          <TextInput value={pincode} onChangeText={setPincode} placeholder="PIN" placeholderTextColor={MUTED} style={styles.input} keyboardType="number-pad" maxLength={10} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.label}>City *</Text>
          <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={MUTED} style={styles.input} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.flex, { marginRight: 10 }]}>
          <Text style={styles.label}>State *</Text>
          <TextInput value={stateName} onChangeText={setStateName} placeholder="State" placeholderTextColor={MUTED} style={styles.input} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.label}>Country *</Text>
          <TextInput value={country} onChangeText={setCountry} placeholder="Country" placeholderTextColor={MUTED} style={styles.input} />
        </View>
      </View>

      <View style={styles.switchRow}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="star" size={16} color={PRIMARY} />
          <Text style={{ fontWeight: "800", marginLeft: 8 }}>Set as default</Text>
        </View>
        <Switch value={isDefault} onValueChange={setIsDefault} />
      </View>

      <TouchableOpacity
        disabled={!canSubmit || submitting}
        onPress={doSubmit}
        activeOpacity={0.9}
        style={[styles.submitBtn, { backgroundColor: canSubmit && !submitting ? BLUE : "#93C5FD" }]}
      >
        <Text style={styles.submitText}>{submitting ? (mode === "edit" ? "Updating…" : "Saving…") : buttonText}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default memo(AddressFormBase);

const styles = StyleSheet.create({
  wrapper: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 12, backgroundColor: "#fff" },
  row: { flexDirection: "row" },
  flex: { flex: 1 },
  label: { color: MUTED, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontWeight: "600",
    color: PRIMARY,
    marginBottom: 10,
  },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  submitBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  submitText: { color: "#fff", fontWeight: "900" },
});
