// app/(tabs)/restaurants/[id].tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image as ExpoImage } from "expo-image";
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { databases, appwriteConfig } from "@/lib/appwrite";
import { Query, Models } from "react-native-appwrite";

const DB_ID = appwriteConfig.databaseId;
const RESTAURANTS_COLLECTION_ID = appwriteConfig.Restaurant_Collection_ID;
const MENU_ITEMS_COLLECTION_ID = appwriteConfig.menuItemsCollectionId;

type MenuItemDoc = Models.Document & {
  name: string;
  price: number;
  photoId?: string;
  restaurant: string;
  description?: string;
};

type RestaurantDoc = Models.Document & {
  name: string;
  description?: string;
  imageUrl?: string;
  openingsstart?: string;
  openingend?: string;
  opendays?: number[];
  timezone?: string;
  menuitems?: (MenuItemDoc | string)[];
};

function parseHHMM(hhmm?: string) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

function isOpenNow(r: RestaurantDoc, nowDate: Date = new Date()) {
  const day = nowDate.getDay();
  const openDays = r.opendays && r.opendays.length ? r.opendays : [0, 1, 2, 3, 4, 5, 6];
  if (!openDays.includes(day)) return false;

  const start = parseHHMM(r.openingsstart);
  const end = parseHHMM(r.openingend);
  if (!start || !end) return false;

  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;

  return startMin <= endMin ? nowMin >= startMin && nowMin <= endMin : nowMin >= startMin || nowMin <= endMin;
}

function dayName(idx: number) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][idx] || "";
}

export default function RestaurantDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const restaurantId = params.id as string;

  // ✅ Call hooks at the top (before any conditional returns)
  const insets = useSafeAreaInsets();
  const TopOffset = Platform.select({ ios: 6, android: 4, default: 6 }); // slightly lowered, feels native

  const [restaurant, setRestaurant] = useState<RestaurantDoc | null>(null);
  const [items, setItems] = useState<MenuItemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const open = useMemo(() => (restaurant ? isOpenNow(restaurant) : false), [restaurant]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, query]);

  const fetchData = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setError(null);
      setLoading(true);

      const rDoc = await databases.getDocument<RestaurantDoc>(
        DB_ID,
        RESTAURANTS_COLLECTION_ID,
        restaurantId
      );
      setRestaurant(rDoc);

      // Prefer embedded reverse relation if available
      let embedded: MenuItemDoc[] | null = null;
      const rel = (rDoc as any)?.menuItems;
      if (Array.isArray(rel) && rel.length > 0) {
        const first = rel[0] as any;
        if (first && typeof first === "object" && first.name !== undefined) {
          embedded = (rel as any[]).filter(Boolean).map((m: any) => ({
            $id: m.$id,
            $databaseId: m.$databaseId,
            $collectionId: m.$collectionId,
            $createdAt: m.$createdAt,
            $updatedAt: m.$updatedAt,
            $permissions: m.$permissions,
            $sequence: m.$sequence,
            name: m.name,
            price: Number(m.price),
            photoId: m.photoId,
            restaurant: m.restaurant,
            description: m.description,
          })) as MenuItemDoc[];
        }
      }

      if (embedded) {
        setItems(embedded.sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const list = await databases.listDocuments<MenuItemDoc>(
          DB_ID,
          MENU_ITEMS_COLLECTION_ID,
          [Query.equal("restaurant", restaurantId), Query.orderAsc("name")]
        );
        setItems(list.documents || []);
      }
    } catch (e: any) {
      console.error("Failed to load restaurant details:", e);
      setError(e?.message || "Failed to load data");
      Alert.alert("Error", e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  const renderItem = ({ item }: { item: MenuItemDoc }) => (
    <TouchableOpacity onPress={() => (router as any).push(`/item/${item.$id}`)}>
      <View style={styles.itemCard}>
       {item.photoId ? (
  <ExpoImage
    source={{ uri: item.photoId }}
    style={styles.itemImage}
    contentFit="cover"
    transition={120}
    onError={(e) =>
      console.log("Image failed:", item.name, item.photoId, e)
    }
  />
) : (
  <View style={[styles.itemImage, styles.itemImagePlaceholder]} />
)}

        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.itemPrice}>₹ {Number(item.price).toFixed(0)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Loading restaurant…</Text>
      </View>
    );
  }

  if (!restaurant) {
    return (
      <View style={styles.center}>
        <Text>Restaurant not found.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Top Bar */}
      <View style={[styles.topBar, { paddingTop: TopOffset }]}>
  <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
    <Ionicons name="chevron-back" size={24} />
  </TouchableOpacity>
  <View style={{ flex: 1 }} />
  <TouchableOpacity onPress={() => (router as any).push("/card")} style={styles.iconBtn}>
    <Ionicons name="cart-outline" size={24} />
  </TouchableOpacity>
</View>


      {/* Header */}
      <View style={styles.header}>
      {restaurant.imageUrl ? (
  <ExpoImage
    source={{ uri: restaurant.imageUrl }}
    style={styles.cover}
    contentFit="cover"
    transition={150}
    onError={(e) =>
      console.log("Image failed:", restaurant.imageUrl, e)
    }
  />
) : (
  <View style={[styles.cover, styles.coverPlaceholder]} />
)}

        <Text style={styles.title}>{restaurant.name}</Text>

        {restaurant.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {restaurant.description}
          </Text>
        ) : null}

        {/* Hours + Days + Open/Closed */}
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={18} />
          <Text style={styles.metaText}>
            {restaurant.openingsstart && restaurant.openingend
              ? `${restaurant.openingsstart} - ${restaurant.openingend}`
              : "Hours not available"}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={18} />
          <Text style={styles.metaText}>
            {restaurant.opendays && restaurant.opendays.length
              ? restaurant.opendays.sort((a, b) => a - b).map(dayName).join(", ")
              : "Open days not set"}
          </Text>
        </View>

        <View style={[styles.statusPillBase, open ? styles.statusPillOpen : styles.statusPillClosed]}>
          <Ionicons name={open ? "checkmark-circle-outline" : "close-circle-outline"} size={18} />
          <Text style={[styles.statusTextBase, open ? styles.statusTextOpen : styles.statusTextClosed]}>
            {open ? "Open Now" : "Closed"}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search menu items"
          style={styles.searchInput}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Items list */}
      <FlatList
        data={filteredItems}
        keyExtractor={(it) => it.$id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text>{query ? "No items match your search" : "No items available"}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    // paddingTop added dynamically via insets
    paddingBottom: 10, // a touch more breathing room
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  cover: { width: "100%", height: 160, borderRadius: 12, backgroundColor: "#EEE" },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", marginTop: 10 },
  description: { fontSize: 14, color: "#444", marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaText: { fontSize: 14, color: "#333" },

  statusPillBase: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillOpen: { backgroundColor: "#E8F7EE" },
  statusPillClosed: { backgroundColor: "#FDEBEC" },
  statusTextBase: { fontWeight: "600" },
  statusTextOpen: { color: "#107C41" },
  statusTextClosed: { color: "#C62828" },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
  },
  searchInput: { flex: 1, fontSize: 15 },

  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E9E9EA",
    gap: 12,
  },
  itemImage: { width: 72, height: 72, borderRadius: 10, backgroundColor: "#EEE" },
  itemImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: "600" },
  itemPrice: { marginTop: 4, fontSize: 14, color: "#333" },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
