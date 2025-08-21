// app/reset-password/new.tsx
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { verifyOtp } from "@/lib/api";

export default function ResetPasswordNew() {
  // useLocalSearchParams can return string | string[]
  const params = useLocalSearchParams<{ userId: string | string[]; otp: string | string[] }>();
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const otp = Array.isArray(params.otp) ? params.otp[0] : params.otp;

  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!userId || !otp) {
      return Alert.alert("Error", "Missing data. Please start the reset process again.");
    }
    if (pwd.length < 8) {
      return Alert.alert("Weak password", "Use at least 8 characters.");
    }
    if (pwd !== confirm) {
      return Alert.alert("Mismatch", "Passwords do not match.");
    }

    setLoading(true);
    try {
      await verifyOtp({ userId: String(userId), otp: String(otp), newPassword: pwd });
      // Backend already updated the Appwrite password.
      // Go back to edit-profile with newPwd prefilled so user can update email.
      router.replace(`/edit-profile?newPwd=${encodeURIComponent(pwd)}` as any);
    } catch (e: any) {
  console.log("[VERIFY] error object:", e);
  const msg =
    typeof e?.message === "string"
      ? e.message
      : (typeof e === "string" ? e : JSON.stringify(e, null, 2));
  Alert.alert("Failed", msg);
} finally {
  setLoading(false);
}
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 12, justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Set a new password</Text>
      <Text style={{ color: "#666" }}>Enter and confirm your new password.</Text>

      <TextInput
        value={pwd}
        onChangeText={setPwd}
        placeholder="New password"
        secureTextEntry
        style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12 }}
      />
      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Confirm new password"
        secureTextEntry
        style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12 }}
      />

      <TouchableOpacity
        onPress={onSubmit}
        disabled={loading}
        style={{
          backgroundColor: loading ? "#ccc" : "#111",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: "white", fontWeight: "600" }}>Update Password</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
