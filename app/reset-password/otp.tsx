import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getCurrentUser } from "@/lib/appwrite";
import { startOtp } from "@/lib/api";

export default function ResetPasswordOtp() {
  const params = useLocalSearchParams<{ userId?: string }>();

  const [accountId, setAccountId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [ttlMs, setTtlMs] = useState(600000);
  const [expiresMs, setExpiresMs] = useState(0);
  const [otp, setOtp] = useState("");

  // Resolve accountId: prefer query param, else try current user
  useEffect(() => {
    (async () => {
      try {
        if (params?.userId) {
          setAccountId(String(params.userId));
          return;
        }
        const userDoc: any = await getCurrentUser();
        if (!userDoc?.accountId) throw new Error("No accountId found");
        setAccountId(userDoc.accountId);
      } catch (e: any) {
        Alert.alert("Not logged in", e?.message || "Please log in again.");
        router.back();
      }
    })();
  }, [params?.userId]);

  // countdowns
  useEffect(() => {
    if (expiresMs <= 0) return;
    const t = setInterval(() => setExpiresMs(ms => Math.max(0, ms - 1000)), 1000);
    return () => clearInterval(t);
  }, [expiresMs]);

  useEffect(() => {
    if (cooldownMs <= 0) return;
    const t = setInterval(() => setCooldownMs(ms => Math.max(0, ms - 1000)), 1000);
    return () => clearInterval(t);
  }, [cooldownMs]);

  async function sendCode() {
    if (!accountId) return Alert.alert("Error", "Missing user id.");
    setSending(true);
    try {
      const r = await startOtp(accountId);
      setCooldownMs(r.resendCooldownMs);
      setTtlMs(r.ttlMs);
      setExpiresMs(r.ttlMs);
      Alert.alert("Code sent", "Check your email for the 6-digit code.");
    } catch (e: any) {
      console.log("[OTP start] error:", e);
      const msg = typeof e?.message === "string" ? e.message : "Failed to send code.";
      Alert.alert("Failed", msg);
    } finally {
      setSending(false);
    }
  }

  function continueNext() {
    if (otp.length !== 6) return Alert.alert("Invalid", "Enter the 6-digit code.");
    router.push(
      `/reset-password/new?userId=${encodeURIComponent(accountId)}&otp=${encodeURIComponent(otp)}` as any
    );
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 12, justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Reset password</Text>
      <Text style={{ color: "#666" }}>We’ll email a 6-digit code linked to your account.</Text>

      <TouchableOpacity
        onPress={sendCode}
        disabled={sending || cooldownMs > 0}
        style={{ backgroundColor: sending || cooldownMs > 0 ? "#ccc" : "#111", padding: 14, borderRadius: 12, alignItems: "center" }}
      >
        {sending ? <ActivityIndicator /> : (
          <Text style={{ color: "white", fontWeight: "600" }}>
            {cooldownMs > 0 ? `Wait ${Math.ceil(cooldownMs / 1000)}s` : "Send code"}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={{ color: "#666" }}>Expires in {Math.ceil(expiresMs / 1000)}s</Text>

      <TextInput
        value={otp}
        onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        placeholder="Enter 6-digit code"
        style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12, letterSpacing: 4 }}
      />

      <TouchableOpacity
        onPress={continueNext}
        style={{ backgroundColor: "#f97316", padding: 14, borderRadius: 12, alignItems: "center" }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}
