import React from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import ImageWithFallback from "./ImageWithFallback";
import { storage, appwriteConfig } from "@/lib/appwrite";

/** If it's a full URL return; else treat as fileId and build /view URL */
export function buildImageUri(val?: string) {
  const placeholder = "https://picsum.photos/320/240";
  if (!val || !val.trim()) return placeholder;
  const v = val.trim();
  if (/^https?:\/\//i.test(v)) return v;
  try {
    return storage.getFileView(appwriteConfig.bucketId, v).toString();
  } catch {
    return placeholder;
  }
}

const COLORS = {
  text: "#181A1F",
  sub: "#667085",
  chipGreenBg: "rgba(16,185,129,0.12)",
  chipGreenText: "#059669",
  chipIndigoBg: "rgba(99,102,241,0.14)",
  chipIndigoText: "#4F46E5",
  stroke: "#EAECF0",
  card: "#FFFFFF",
};

const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 1 },
});

export default function RestaurantCardLight({
  item,
  onPress,
}: {
  item: {
    $id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    rating?: number;
    deliveryTimeMins?: number;
    address?: string;
  };
  onPress: () => void;
}) {
  const uri = buildImageUri(item.imageUrl);

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[{ marginHorizontal: 20, marginBottom: 12 }, shadow]}
    >
      <View
        style={{
          backgroundColor: COLORS.card,
          borderRadius: 16,
          borderColor: COLORS.stroke,
          borderWidth: 1,
          padding: 12,
        }}
      >
        <View style={{ flexDirection: "row", gap: 12, alignItems: "stretch" }}>
          <ImageWithFallback src={uri} alt={item.name} width={112} height={92} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>
              {item.name}
            </Text>
            {!!item.description && (
              <Text style={{ color: COLORS.sub, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {!!item.rating && (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: COLORS.chipGreenBg,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.25)",
                  }}
                >
                  <Text style={{ color: COLORS.chipGreenText, fontSize: 11 }}>⭐ {item.rating.toFixed(1)}</Text>
                </View>
              )}
              {!!item.deliveryTimeMins && (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: COLORS.chipIndigoBg,
                    borderWidth: 1,
                    borderColor: "rgba(99,102,241,0.25)",
                  }}
                >
                  <Text style={{ color: COLORS.chipIndigoText, fontSize: 11 }}>⏱ {item.deliveryTimeMins} mins</Text>
                </View>
              )}
            </View>
            {!!item.address && (
              <Text style={{ color: COLORS.sub, fontSize: 11, marginTop: 8 }} numberOfLines={1}>
                {item.address}
              </Text>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
