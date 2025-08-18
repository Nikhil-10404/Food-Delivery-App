// LogoutButton.tsx
import React, { useState } from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { Account } from "appwrite";
import { useRouter,Redirect } from "expo-router";
import useAuthStore from "@/store/auth.store";

interface LogoutButtonProps {
  account: Account; // pass your Appwrite Account instance
}

const LogoutButton = ({ account }:LogoutButtonProps) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      // Logs out from the current session
      await account.deleteSession("current");
      const { setIsAuthenticated, setUser } = useAuthStore.getState();
    setIsAuthenticated(false);
    setUser(null);
      // Redirect to sign-in page
      router.replace("/sign-in");
    } catch (err) {
      console.error("Logout failed:", err);
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleLogout}
      style={{
        backgroundColor: "#FF4D4D", // red for logout
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 10,
        alignItems: "center",
        marginVertical: 10,
      }}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
          Logout
        </Text>
      )}
    </TouchableOpacity>
  );
};

export default LogoutButton;
