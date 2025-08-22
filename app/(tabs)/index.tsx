import { SafeAreaView } from "react-native-safe-area-context";
import "../globals.css";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import CartButton from "@/components/CardButton";
import useAuthStore from "@/store/auth.store";
import { databases, appwriteConfig, storage } from "@/lib/appwrite";
import { Query } from "react-native-appwrite";

// ====== IDs from your config ======
const DB_ID = appwriteConfig.databaseId;
const COLLECTION_RESTAURANTS = appwriteConfig.Restaurant_Collection_ID;
// ==================================

const MOOD_LINES = [
  "What’s your mood today?",
  "Craving something tasty?",
  "Quick bite or full feast?",
  "Something new or your usual?",
  "Feeling snacky or hungry-hungry?",
];

type Restaurant = {
  $id: string;
  name: string;
  imageUrl?: string; // fileId (preferred) or https URL
  rating?: number;
  address?: string;
  categories?: string[];
  deliveryTimeMins?: number;
  description?: string;
};

function timeOfDayGreeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Build image URI:
 * - If stored value is a full URL → return it
 * - Else assume it's an Appwrite fileId → return getFileView URL
 */
function buildImageUri(val?: string) {
  const placeholder = "https://picsum.photos/320/240";
  if (!val || !val.trim()) return placeholder;

  const v = val.trim();
  if (/^https?:\/\//i.test(v)) {
    return v;
  }

  try {
    // Use getFileView instead of getFilePreview (preview is blocked on free plan)
    return storage.getFileView(appwriteConfig.bucketId, v).toString();
  } catch (e) {
    console.error("❌ Failed to build Appwrite view URL for", v, e);
    return placeholder;
  }
}

/**
 * Image component with single fallback:
 * - Try /view (default)
 * - If fails, try /download
 */
function ImageWithFallback({
  src,
  altName,
}: {
  src: string;
  altName: string;
}) {
  const [uri, setUri] = useState(src);
  const [triedDownload, setTriedDownload] = useState(false);

  const buildDownloadUrl = (input: string) => {
    try {
      const u = new URL(input);
      const parts = u.pathname.split("/").filter(Boolean);
      const bIdx = parts.indexOf("buckets");
      const fIdx = parts.indexOf("files");
      const bucketId = parts[bIdx + 1];
      const fileId = parts[fIdx + 1];
      return `${u.origin}/v1/storage/buckets/${bucketId}/files/${fileId}/download?project=${u.searchParams.get(
        "project"
      ) || ""}`;
    } catch {
      return input;
    }
  };

  useEffect(() => {
    setUri(src);
    setTriedDownload(false);
  }, [src]);

  return (
    <Image
      source={{ uri }}
      style={{ width: 96, height: 80, borderRadius: 12, backgroundColor: "#eee" }}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      onError={() => {
        if (!triedDownload) {
          setTriedDownload(true);
          setUri(buildDownloadUrl(src));
        }
      }}
    />
  );
}

export default function HomeIndex() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [search, setSearch] = useState("");
  const [mood, setMood] = useState(MOOD_LINES[0]);
  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);

  useEffect(() => {
    setMood(MOOD_LINES[Math.floor(Math.random() * MOOD_LINES.length)]);
  }, []);

  const username =
    (user?.name && user.name.trim()) ||
    (user?.email && user.email.split("@")[0]) ||
    "Foodie";

  const greeting = `${timeOfDayGreeting()}, ${username}`;

  const loadRestaurants = useCallback(
    async (q?: string) => {
      setLoading(true);
      try {
        const queries: any[] = [Query.orderAsc("name")];
        if (q && q.trim()) queries.push(Query.search("name", q.trim()));

        const res = await databases.listDocuments(DB_ID, COLLECTION_RESTAURANTS, queries);
        const docs = res.documents as unknown as Restaurant[];

        const normalized = q?.trim().toLowerCase();
        const filtered =
          normalized && normalized.length > 0
            ? docs.filter((r) => {
                const hay = `${r.name ?? ""} ${r.address ?? ""} ${(r.categories || []).join(
                  " "
                )} ${r.description ?? ""}`.toLowerCase();
                return hay.includes(normalized);
              })
            : docs;

        setRestaurants(filtered);
      } catch (e) {
        console.warn("Failed to load restaurants", e);
        setRestaurants([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadRestaurants();
  }, [loadRestaurants]);

  const onSubmitSearch = () => loadRestaurants(search);

  const header = useMemo(
    () => (
      <View className="px-5">
        <Text className="text-3xl font-extrabold text-black">Foodie</Text>
        <View className="mt-1 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-neutral-600">NIT HAMIRPUR</Text>
          <CartButton />
        </View>
        <View className="mt-4">
          <Text className="text-2xl font-bold text-black">{greeting}</Text>
          <Text className="text-base text-neutral-600 mt-1">{mood}</Text>
        </View>
        <View className="mt-4 flex-row items-center bg-white rounded-2xl border px-3 py-2">
          <TextInput
            placeholder="Search cafés or dishes…"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={onSubmitSearch}
            returnKeyType="search"
            className="flex-1 text-base"
          />
          <TouchableOpacity onPress={onSubmitSearch}>
            <Text className="text-indigo-600 font-semibold">Search</Text>
          </TouchableOpacity>
        </View>
        <Text className="mt-5 mb-2 text-lg font-semibold text-black">
          All Restaurants (A–Z)
        </Text>
      </View>
    ),
    [greeting, mood, search]
  );

  const renderRestaurant = ({ item }: { item: Restaurant }) => {
    const uri = buildImageUri(item.imageUrl);
    // console.log("🔍 Rendering:", item.name, "| uri:", uri);

    return (
      <TouchableOpacity
        onPress={() => router.push(`/restaurants/${item.$id}`)}
        className="mx-5 mb-3 bg-white rounded-2xl p-3 border"
        activeOpacity={0.85}
      >
        <View className="flex-row gap-3">
          <ImageWithFallback src={uri} altName={item.name} />
          <View className="flex-1">
            <Text className="text-base font-semibold text-black" numberOfLines={1}>
              {item.name}
            </Text>
            {!!item.description && (
              <Text className="text-xs text-neutral-600 mt-0.5" numberOfLines={2}>
                {item.description}
              </Text>
            )}
            {!!item.address && (
              <Text className="text-[11px] text-neutral-500 mt-1" numberOfLines={1}>
                {item.address}
              </Text>
            )}
            <View className="flex-row items-center gap-2 mt-1">
              {!!item.rating && <Text className="text-xs text-neutral-700">⭐ {item.rating}</Text>}
              {!!item.deliveryTimeMins && (
                <Text className="text-xs text-neutral-700">⏱ {item.deliveryTimeMins} mins</Text>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {loading && restaurants.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
          <Text className="text-xs text-neutral-500 mt-2">Loading restaurants…</Text>
        </View>
      ) : (
        <FlatList
          data={restaurants}
          keyExtractor={(i) => i.$id}
          renderItem={renderRestaurant}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 96 }}
          onRefresh={() => loadRestaurants(search)}
          refreshing={loading}
        />
      )}
    </SafeAreaView>
  );
}
