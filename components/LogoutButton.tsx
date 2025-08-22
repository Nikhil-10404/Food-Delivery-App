// components/LogoutButton.tsx
import React, { useState } from "react";
import { Pressable, Text, ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Account } from "appwrite";
import { useRouter } from "expo-router";
import useAuthStore from "@/store/auth.store";

interface LogoutButtonProps {
  account: Account;           // Appwrite Account instance
  style?: object;             // optional extra container styles
  label?: string;             // optional custom label
}

const LogoutButton = ({ account, style, label = "Logout" }: LogoutButtonProps) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await account.deleteSession("current");
      const { setIsAuthenticated, setUser } = useAuthStore.getState();
      setIsAuthenticated(false);
      setUser(null);
      router.replace("/sign-in");
    } catch (err) {
      console.error("Logout failed:", err);
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handleLogout}
      disabled={loading}
      hitSlop={12}
     style={({ pressed }) => [
  {
    paddingHorizontal: 24,      // give some horizontal padding
    height: 52,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#ef4444",
    backgroundColor: pressed ? "#fee2e2" : "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    opacity: loading ? 0.7 : 1,
  },
  style,
]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color="#ef4444" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="log-out-outline" size={18} color="#ef4444" />
          <Text
            style={{
              color: "#ef4444",
              fontWeight: "700",
              fontSize: 16,
              marginLeft: 8,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

export default LogoutButton;
