import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Platform } from "react-native";

const CARDS = [
  { title: "Summer Combo", price: "$10.88", color: "#F97316" },
  { title: "Burgers",      price: "from $5", color: "#F59E0B" },
  { title: "Pizza",        price: "from $7", color: "#065F46" },
  { title: "Burrito",      price: "from $6", color: "#059669" },
];

const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 10 } },
  android: { elevation: 2 },
});

export default function PromoStrip() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 6 }}
      style={{ marginTop: 2 }}
    >
      {CARDS.map((c, i) => (
        <TouchableOpacity
          key={i}
          activeOpacity={0.92}
          style={[
            {
              width: 260,
              marginRight: 14,
              backgroundColor: c.color,
              borderRadius: 18,
              padding: 16,
            },
            shadow,
          ]}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "800" }}>{c.title}</Text>
          <Text style={{ color: "white", opacity: 0.9, marginTop: 6, fontWeight: "700" }}>{c.price}</Text>
          <Text style={{ color: "white", marginTop: 10, opacity: 0.9 }}>→</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
