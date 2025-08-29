import React, { useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, Platform } from "react-native";
import LocationPicker from "@/components/location/LocationPicker";

const COLORS = {
  text: "#181A1F",
  sub: "#667085",
  mint: "#22C55E",
  stroke: "#EAECF0",
  glass: "rgba(255,255,255,0.7)",
};

const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 1 },
});

export default function HomeHeaderLight({
  greeting,
  mood,
  search,
  onChangeSearch,
  onSubmitSearch,
}: {
  greeting: string;
  mood: string;
  search: string;
  onChangeSearch: (v: string) => void;
  onSubmitSearch: () => void;
}) {
  // random tiny caption under title so it feels alive
  const caption = useMemo(
    () => ["Fresh • Fast • Tasty", "Curated for SMS", "Order in 2 taps"].sort(() => 0.5 - Math.random())[0],
    []
  );

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18 }}>
      {/* Warm hero banner behind header */}
      <View style={{ position: "absolute", inset: 0, height: 180, backgroundColor: "#FFF7ED", borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }} />
      {/* Title row */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: COLORS.text, fontSize: 34, fontWeight: "800" }}>Foodie</Text>
          <Text style={{ color: COLORS.sub, fontSize: 12, fontWeight: "600", marginTop: 2 }}>SMS MEDICAL COLLEGE • {caption}</Text>
        </View>
      </View>

      {/* Greeting */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "800" }}>{greeting}</Text>
        <Text style={{ color: COLORS.sub, fontSize: 15, marginTop: 4 }}>{mood}</Text>
      </View>

      {/* Glassy search */}
      <View
        style={[
          {
            marginTop: 16,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: COLORS.glass,
            borderColor: COLORS.stroke,
            borderWidth: 1,
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 8,
          },
          shadow,
        ]}
      >
        <Text style={{ fontSize: 18, marginRight: 8 }}>🔎</Text>
        <TextInput
          placeholder="Search cafés "
          placeholderTextColor="#98A2B3"
          value={search}
          onChangeText={onChangeSearch}
          onSubmitEditing={onSubmitSearch}
          returnKeyType="search"
          style={{ flex: 1, fontSize: 16, color: COLORS.text }}
        />
        <TouchableOpacity
          onPress={onSubmitSearch}
          style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.mint, borderRadius: 12 }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Search</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700", marginTop: 18 }}>All Restaurants (A–Z)</Text>
    </View>
  );
}
