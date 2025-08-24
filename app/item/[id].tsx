import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  ToastAndroid,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { databases, appwriteConfig, getCurrentUser } from "@/lib/appwrite";
import type { Models } from "react-native-appwrite";
import { Query } from "react-native-appwrite";
import { useCart } from "@/store/cart";
import { Ionicons } from "@expo/vector-icons";

const DB_ID = appwriteConfig.databaseId;
const MENU_ITEMS = appwriteConfig.menuItemsCollectionId;
const RATINGS = appwriteConfig.ratingsCollectionId;
const RATINGS_AGG_URL: string | undefined = (appwriteConfig as any).ratingsAggregateUrl;

type Params = {
  id: string;
  restaurantId?: string;
  restaurantName?: string;
  back?: string;              // 👈 added
};

type MenuItemDoc = Models.Document & {
  name: string;
  price: number;
  photoId?: string;
  description?: string;
  restaurant: string;
  veg?: boolean;
  category?: string;
  pairWith?: string[];
};

type RatingDoc = Models.Document & { itemId: string; userId: string; value: number };

export default function ItemDetails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { back: backParam } = useLocalSearchParams<{ back?: string }>();
const safeBack = backParam && backParam.startsWith("/") ? backParam : undefined;
   const { id, restaurantId, restaurantName, back } =
    useLocalSearchParams<Params>();

  const [item, setItem] = useState<MenuItemDoc | null>(null);
  const [loading, setLoading] = useState(true);

  // ratings
  const [avg, setAvg] = useState<number>(0);
  const [count, setCount] = useState<number>(0);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);

  // best paired with
  const [pairs, setPairs] = useState<MenuItemDoc[]>([]);
  const [pairsLoading, setPairsLoading] = useState(false);

  // cart (no qty stepper here)
  const [showMiniBar, setShowMiniBar] = useState(false);
  const { addItem, removeItem, getItemQty, getRestaurantCount } = useCart();

  const showToast = (msg: string) => {
    if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
    else alert(msg);
  };

  // ---- Fetch item ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const doc = await databases.getDocument<MenuItemDoc>(DB_ID, MENU_ITEMS, String(id));
        if (!mounted) return;
        setItem({ ...doc, price: Number(doc.price) });
      } catch (e) {
        console.warn("Item fetch failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  const rId = String(restaurantId || item?.restaurant || "");
  const rName = String(restaurantName || "");

  // ✅ Subscribe to cart state with a zustand selector — updates instantly after add/remove
  const inCartQty = useCart((s) => (item && rId ? s.getItemQty(rId, item.$id) : 0));
  const isInCart = inCartQty > 0;

  // ---- Ratings aggregate + my rating ----
  const loadRatings = useCallback(async () => {
    if (!id) return;
    try {
      const me = await getCurrentUser().catch(() => null);
      const userId = me?.$id;

      if (RATINGS_AGG_URL) {
        try {
          const res = await fetch(`${RATINGS_AGG_URL}?itemId=${encodeURIComponent(String(id))}`);
          if (res.ok) {
            const j = await res.json();
            setAvg(Number(j?.avg || 0));
            setCount(Number(j?.count || 0));
          } else {
            throw new Error("bad function status");
          }
        } catch {
          await clientAggregate();
        }
      } else {
        await clientAggregate();
      }

      async function clientAggregate() {
        const list = await databases.listDocuments<RatingDoc>(DB_ID, RATINGS, [
          Query.equal("itemId", String(id)),
          Query.limit(1000),
        ]);
        const values = list.documents.map((d) => Number(d.value));
        const c = values.length;
        const a = c ? values.reduce((s, v) => s + v, 0) / c : 0;
        setAvg(a);
        setCount(c);
        if (userId) {
          const mine = list.documents.find((d) => d.userId === userId);
          setMyRating(mine ? Number(mine.value) : null);
        } else setMyRating(null);
      }
    } catch (e) {
      console.warn("Ratings fetch failed", e);
    }
  }, [id]);

  useEffect(() => {
    loadRatings();
  }, [loadRatings]);

  // ---- Best paired with ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!item?.pairWith?.length) {
        setPairs([]);
        return;
      }
      setPairsLoading(true);
      try {
        const list = await databases.listDocuments<MenuItemDoc>(DB_ID, MENU_ITEMS, [
          Query.equal("$id", item.pairWith),
          Query.limit(10),
        ]);
        if (!mounted) return;
        setPairs(list.documents);
      } catch (e) {
        console.warn("pairs fetch failed", e);
      } finally {
        if (mounted) setPairsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [item?.pairWith]);

  // Back: prefer true back; if no history, go to restaurant details
   const onBack = () => {
  // @ts-ignore expo-router exposes canGoBack on native
  if (router.canGoBack?.()) {
    router.back();
  } else if (safeBack) {
    router.replace(safeBack as any);   // 👈 cast to satisfy Href typing
  } else if (rId) {
    router.replace(`/restaurants/${rId}`);
  } else {
    router.replace("/");
  }
};


  const goCart = () => rId && router.push(`/cart/${rId}`); 

  const submitRating = async (value: number) => {
    if (ratingBusy || !id) return;
    setRatingBusy(true);
    try {
      const me = await getCurrentUser();
      if (!me) {
        showToast("Please sign in to rate.");
        return;
      }
      const userId = me.$id;

      const existing = await databases
        .listDocuments<RatingDoc>(DB_ID, RATINGS, [
          Query.equal("itemId", String(id)),
          Query.equal("userId", userId),
          Query.limit(1),
        ])
        .catch(() => ({ documents: [] as RatingDoc[] }));

      if (existing.documents.length) {
        await databases.updateDocument(DB_ID, RATINGS, existing.documents[0].$id, { value });
      } else {
        await databases.createDocument(DB_ID, RATINGS, "unique()", {
          itemId: String(id),
          userId,
          value,
        });
      }

      setMyRating(value);
      showToast("Thanks for the rating!");
      await loadRatings();
    } catch (e: any) {
      console.warn("rate error", e?.message || e);
      showToast("Could not submit rating. Try again.");
    } finally {
      setRatingBusy(false);
    }
  };

  const handleAdd = () => {
    if (!item || !rId) return;
    addItem({
      restaurantId: rId,
      restaurantName: rName,
      item: { id: item.$id, name: item.name, price: Number(item.price), photoId: item.photoId },
      qty: 1,
    });
    // ✅ instantly show mini bar and the UI flips because of zustand selector above
    setShowMiniBar(true);
    showToast("Added to cart ✓");
    setTimeout(() => setShowMiniBar(false), 4000);
  };

  const handleRemove = () => {
    if (!item || !rId) return;
    removeItem(rId, item.$id);
    setShowMiniBar(false);
    showToast("Removed from cart");
  };

  // ——— Loading / Not found ———
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8 }}>Loading item…</Text>
      </View>
    );
  }
  if (!item) {
    return (
      <View style={styles.center}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={{ marginTop: 12 }}>Item not found</Text>
      </View>
    );
  }

  const isVeg = !!item.veg;
  const category = item.category || "Popular";

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Top bar — lowered more */}
      <View
        style={[
          styles.topBar,
          { paddingTop: Math.max(insets.top * 0.6, 10), marginBottom: 8 }, // lower the icons
        ]}
      >
        <TouchableOpacity onPress={onBack} style={[styles.iconBtn, { marginTop: 6 }]}>
          <Ionicons name="chevron-back" size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {!!rId && (
          <TouchableOpacity onPress={goCart} style={[styles.iconBtn, { marginTop: 6 }]}>
            <Ionicons name="cart-outline" size={22} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {!!item.photoId && <Image source={{ uri: item.photoId }} style={styles.image} />}

        {/* Title + Price pill */}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.pricePill}>
            <Text style={styles.priceText}>₹ {Number(item.price).toFixed(0)}</Text>
          </View>
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={[styles.vegDot, { backgroundColor: isVeg ? "#16A34A" : "#B91C1C" }]} />
          <Text style={styles.metaText}>{isVeg ? "Veg" : "Non-Veg"}</Text>
          <View style={styles.dot} />
          <View style={styles.chip}>
            <Text style={styles.chipText}>{category}</Text>
          </View>
          <View style={styles.dot} />
          <Ionicons name="star" size={14} />
          <Text style={styles.metaText}>{avg ? avg.toFixed(1) : "—"}</Text>
          <Text style={[styles.metaText, { opacity: 0.7 }]}> ({count})</Text>
        </View>

        {/* Rate */}
        <View style={{ marginTop: 10 }}>
          <Text style={styles.sectionTitle}>Rate this item</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((v) => (
              <TouchableOpacity key={v} onPress={() => submitRating(v)} disabled={ratingBusy} style={styles.starBtn}>
                <Ionicons
                  name={(myRating ?? 0) >= v ? "star" : "star-outline"}
                  size={28}
                  color={(myRating ?? 0) >= v ? "#F59E0B" : undefined}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ marginTop: 4, opacity: 0.7 }}>
            {myRating ? `Your rating: ${myRating}★` : "Tap a star to submit"}
          </Text>
        </View>

        {!!item.description && <Text style={styles.desc}>{item.description}</Text>}

        {/* Best paired with */}
        <View style={{ marginTop: 16 }}>
          <Text style={styles.sectionTitle}>Best paired with</Text>
          {pairsLoading ? (
            <ActivityIndicator style={{ marginTop: 10 }} />
          ) : !pairs.length ? (
            <Text style={{ marginTop: 8, opacity: 0.7 }}>No pair suggestions yet.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              {pairs.map((p) => (
                <View key={p.$id} style={styles.pairCard}>
                  <Image source={{ uri: p.photoId || "" }} style={styles.pairImg} />
                  <Text style={styles.pairName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.pairPrice}>₹ {Number(p.price).toFixed(0)}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky CTA — Add OR full-width red Remove */}
      <View style={styles.ctaBar}>
        {!isInCart ? (
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.9}>
            <Text style={styles.addText}>Add to Cart</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.removeBtn} onPress={handleRemove} activeOpacity={0.9}>
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={styles.removeText}>Remove from Cart</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Mini view bar — single way to jump to cart */}
      {(showMiniBar || isInCart) && (
        <MiniCartBar
          onPress={() => {
            setShowMiniBar(false);
            goCart();
          }}
          count={useCart.getState().getRestaurantCount(rId)}
        />
      )}
    </View>
  );
}

/* Mini bar component */
function MiniCartBar({ onPress, count }: { onPress: () => void; count: number }) {
  return (
    <TouchableOpacity activeOpacity={0.95} onPress={onPress} style={styles.miniBar}>
      <Ionicons name="cart" size={18} color="#fff" />
      <Text style={styles.miniBarText}>View items in cart</Text>
      <View style={styles.miniBadge}>
        <Text style={styles.miniBadgeText}>{Math.max(1, count)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#fff" />
    </TouchableOpacity>
  );
}

/* Styles */
const GREEN = "#22C55E";
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },

  topBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  iconBtn: {
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },

  body: { paddingHorizontal: 16, paddingBottom: 16 },
  image: { width: "100%", height: 240, borderRadius: 16, backgroundColor: "#eee", marginBottom: 14 },

  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { flex: 1, fontSize: 24, fontWeight: "800" },
  pricePill: { backgroundColor: "#111827", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  priceText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  metaRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  vegDot: { width: 10, height: 10, borderRadius: 5 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" },
  metaText: { fontSize: 13, fontWeight: "600" },

  chip: { backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: "700" },

  sectionTitle: { fontSize: 16, fontWeight: "800" },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  starBtn: { padding: 2 },
  desc: { fontSize: 14, opacity: 0.9, marginTop: 12, lineHeight: 20 },

  pairCard: { width: 120, marginRight: 12, backgroundColor: "#F3F4F6", borderRadius: 12, padding: 8 },
  pairImg: { width: "100%", height: 70, borderRadius: 8, backgroundColor: "#e9e9e9" },
  pairName: { marginTop: 6, fontWeight: "700" },
  pairPrice: { opacity: 0.8, marginTop: 2 },

  ctaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  addBtn: { flex: 1, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  addText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  // Full-width red remove
  removeBtn: {
    flex: 1,
    backgroundColor: "#EF4444",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  removeText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  backBtn: { paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 16, fontWeight: "700", marginLeft: 4 },

  miniBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 76,
    backgroundColor: "#111827",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  miniBarText: { color: "#fff", fontWeight: "800", flex: 1 },
  miniBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  miniBadgeText: { fontWeight: "800" },
});
