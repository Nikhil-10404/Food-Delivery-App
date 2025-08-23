import React from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { useRouter, useSegments } from "expo-router";

const COLORS = {
  active: "#111827",
  idle: "#9CA3AF",
};

export default function TabsBarLight() {
  const router = useRouter();
  const segments = useSegments();
  const active = `/${segments.join("/")}`;

  const items = [
    { key: "home",    label: "Home",    icon: "🏠", route: "/(tabs)" },
    { key: "search",  label: "Search",  icon: "🔎", route: "/search" },
    { key: "cart",    label: "Cart",    icon: "🧺", route: "/cart" },
    { key: "profile", label: "Profile", icon: "👤", route: "/profile" },
  ];

  return (
    <View
      // transparent, floating touch targets only
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 12,
        paddingHorizontal: 24,
        paddingVertical: 0,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "transparent",
      }}
      pointerEvents="box-none"
    >
      {items.map((it) => {
        const isActive = active === it.route || (it.key === "home" && active === "/");
        return (
          <TouchableOpacity
            key={it.key}
            activeOpacity={0.8}
            onPress={() => router.push(it.route as any)}
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 12,
              // no background, no border
            }}
          >
            <Text style={{ fontSize: 18, opacity: isActive ? 1 : 0.55 }}>{it.icon}</Text>
            <Text
              style={{
                fontSize: 11,
                marginTop: 4,
                color: isActive ? COLORS.active : COLORS.idle,
                fontWeight: isActive ? "700" : "600",
              }}
            >
              {it.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
