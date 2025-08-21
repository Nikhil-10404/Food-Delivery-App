// app/edit-profile.tsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { updateEmailAdmin } from "@/lib/api";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  databases,
  getCurrentUser,
  appwriteConfig,
  account,
  signIn, // ⬅️ we’ll use this to reauthenticate after password reset
} from "@/lib/appwrite";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";

export default function EditProfileScreen() {
  const params = useLocalSearchParams<{ newPwd?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [docId, setDocId] = useState<string | null>(null); // Users collection doc id
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(""); // string
  const [emailOnFile, setEmailOnFile] = useState(""); // ⬅️ current email (for reauth)

  // --- Update Email flow state ---
  const [currentPassword, setCurrentPassword] = useState(""); // will be set to newPwd after reset flow
  const [newEmail, setNewEmail] = useState("");

  // Bottom sheets
  const pwdSheetRef = useRef<BottomSheetModal | null>(null);
  const emailSheetRef = useRef<BottomSheetModal | null>(null);
  const snapPointsPwd = useMemo(() => ["42%"], []);
  const snapPointsEmail = useMemo(() => ["42%"], []);

  useEffect(() => {
    (async () => {
      try {
        const userDoc = await getCurrentUser();
        if (!userDoc) return;
        setDocId(userDoc.$id);
        setName(userDoc.name ?? "");
        setPhone(userDoc.phone ?? "");
        setEmailOnFile(userDoc.email ?? ""); // ⬅️ capture current email for reauth
      } catch (e) {
        console.error("Failed to load user:", e);
        Alert.alert("Error", "Could not load your profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ⬇️ When we arrive with ?newPwd=..., set it as currentPassword and reauth with it.
  useEffect(() => {
    const np = params?.newPwd ? String(params.newPwd) : "";
    if (!np) return;

    (async () => {
      try {
        // Prefill current password so updateEmail can use it
        setCurrentPassword(np);

        // Re-authenticate because server-side password change likely invalidated the session
        if (emailOnFile) {
          try {
            // clear any broken sessions quietly
            await account.deleteSessions().catch(() => {});
            // create a fresh session with the NEW password
            await signIn({ email: emailOnFile, password: np });
          } catch (e) {
            console.warn("Reauth with new password failed (will still let user try):", e);
          }
        }

        // Open the email update sheet automatically for a smooth flow
        setTimeout(() => emailSheetRef.current?.present(), 200);
      } catch (e) {
        console.warn("post-reset init failed:", e);
      }
    })();
  }, [params?.newPwd, emailOnFile]);

  const onSaveBasics = async () => {
    try {
      if (!name.trim()) {
        Alert.alert("Name required", "Please enter your full name.");
        return;
      }
      setSaving(true);

      // keep Appwrite Account name in sync (non-fatal if fails)
      try {
        await account.updateName(name.trim());
      } catch (e) {
        console.warn("account.updateName failed (non-fatal):", e);
      }

      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userCollectionId,
        docId!,
        { name: name.trim(), phone: phone.trim() }
      );

      Alert.alert("Saved", "Your profile was updated.");
      router.back();
    } catch (e: any) {
      console.error("Save error:", e);
      Alert.alert("Error", e?.message ?? "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  // ---- Update Email flow handlers ----
  const openUpdateEmail = () => {
    setCurrentPassword("");
    setNewEmail("");
    pwdSheetRef.current?.present();
  };

  const proceedToEmail = () => {
    if (!currentPassword) {
      Alert.alert("Password required", "Please enter your current password.");
      return;
    }
    pwdSheetRef.current?.dismiss();
    setTimeout(() => emailSheetRef.current?.present(), 150);
  };

  const submitNewEmail = async () => {
  try {
    if (!newEmail.trim()) {
      Alert.alert("Email required", "Please enter your new email.");
      return;
    }
    const nextEmail = newEmail.trim();

    // We’ll call the backend to update via Admin API (no session needed)
    const payload = {
      userId: (await account.get()).$id,  // Appwrite Account ID of the logged-in user
      newEmail: nextEmail,
      userDocId: docId || undefined,      // mirror to Users collection server-side
    };

    const r = await updateEmailAdmin(payload);
    if (!r.ok) {
      const msg = r?.detail || "Failed to update email.";
      throw new Error(msg);
    }

    // (Optional) If the backend warned mirroring failed, try client-side mirror as fallback
    try {
      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userCollectionId,
        docId!,
        { email: nextEmail }
      );
    } catch {}

    Alert.alert("Email updated", "Your email has been changed.");
    // Refresh local state so UI shows latest
    try {
      const refreshed = await getCurrentUser();
      // set display fields as you like; e.g., setEmailOnFile(nextEmail)
    } catch {}
    emailSheetRef.current?.dismiss();
  } catch (e: any) {
    console.error("updateEmail error:", e);
    const msg = typeof e?.message === "string" ? e.message : "Failed to update email.";
    Alert.alert("Error", msg);
  }
};


  return (
    <View className="flex-1 bg-[#f9fafb]">
      {/* Header */}
      <View className="px-5 pt-12 pb-4 flex-row items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-white items-center justify-center shadow"
        >
          <Ionicons name="chevron-back" size={20} color="#111827" />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-xl font-bold text-gray-900 mr-9">
          Edit Profile
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm border border-gray-50">
          {/* Name */}
          <Text className="text-xs text-gray-500 mb-1">Full Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            autoCapitalize="words"
            className="border border-gray-200 rounded-xl px-3 py-2 mb-4"
          />

          {/* Phone (string) */}
          <Text className="text-xs text-gray-500 mb-1">Phone Number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            keyboardType="phone-pad"
            className="border border-gray-200 rounded-xl px-3 py-2 mb-6"
          />

          {/* Update Email section trigger */}
          <View className="mb-4">
            <Text className="text-xs text-gray-500 mb-2">Email</Text>
            <TouchableOpacity
              onPress={openUpdateEmail}
              className="flex-row items-center justify-between border border-gray-200 rounded-xl px-3 py-3"
            >
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-orange-100 items-center justify-center mr-2">
                  <Ionicons name="mail-outline" size={18} color="#f97316" />
                </View>
                <Text className="text-gray-800 font-medium">Update Email</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Save basics (name/phone) */}
          <TouchableOpacity
            onPress={onSaveBasics}
            disabled={saving}
            className={`mt-2 rounded-2xl px-4 py-3 ${
              saving ? "bg-gray-300" : "bg-orange-500"
            }`}
          >
            <Text className="text-white text-center font-semibold">
              {saving ? "Saving…" : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* --- SHEET 1: current password --- */}
      <BottomSheetModal
        ref={pwdSheetRef}
        snapPoints={snapPointsPwd}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#fff" }}
        handleIndicatorStyle={{ backgroundColor: "#ccc" }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
      >
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
        >
          <Text className="text-lg font-bold text-gray-900 mb-3">Verify password</Text>
          <Text className="text-gray-600 mb-4">
            Enter your current password to continue.
          </Text>

          <Text className="text-xs text-gray-500 mb-1">Current password</Text>
          <BottomSheetTextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Enter current password"
            secureTextEntry
            style={{
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 12,
              fontSize: 16,
            }}
          />

          <TouchableOpacity
            onPress={() => {
              pwdSheetRef.current?.dismiss();
              router.push("/reset-password/otp" as any); // string-based route
            }}
          >
            <Text className="text-orange-600">Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={proceedToEmail}
            className="mt-5 rounded-xl bg-orange-500 py-3"
          >
            <Text className="text-white text-center font-semibold">Continue</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* --- SHEET 2: new email --- */}
      <BottomSheetModal
        ref={emailSheetRef}
        snapPoints={snapPointsEmail}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#fff" }}
        handleIndicatorStyle={{ backgroundColor: "#ccc" }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
      >
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
        >
          <Text className="text-lg font-bold text-gray-900 mb-3">Update email</Text>

          <Text className="text-xs text-gray-500 mb-1">New email</Text>
          <BottomSheetTextInput
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            style={{
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 16,
              fontSize: 16,
            }}
          />

          <TouchableOpacity
            onPress={submitNewEmail}
            className="rounded-xl bg-orange-500 py-3"
          >
            <Text className="text-white text-center font-semibold">Save Email</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}
