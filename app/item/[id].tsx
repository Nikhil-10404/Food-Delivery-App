// app/item/[id].tsx
import React, { useEffect, useMemo, useState } from "react";
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
import { databases, appwriteConfig } from "@/lib/appwrite";
import type { Models } from "react-native-appwrite";
import { useCart } from "@/store/cart";
import { Ionicons } from "@expo/vector-icons";

const DB_ID = appwriteConfig.databaseId;
const MENU_ITEMS_COLLECTION_ID = appwriteConfig.menuItemsCollectionId;

type Params = { id: string; restaurantId?: string; restaurantName?: string };

type MenuItemDoc = Models.Document & {
  name: string;
  price: number;
  photoId?: string;
  description?: string;
  category?: string;      // optional in your schema
  veg?: boolean;          // optional in your schema
  rating?: number;        // optional in your schema
  ratingCount?: number;   // optional in your schema
  restaurant: string;
};

export default function ItemDetails() {
  const router = useRouter();
  const { id, restaurantId, restaurantName } = useLocalSearchParams<Params>();
  const [item, setItem] = useState<MenuItemDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [qty, setQty] = useState(1);
  const [locallyAdded, setLocallyAdded] = useState(false); // UI guard for duplicate taps

  const { addItem /* If your store exposes hasItem/getItem, prefer that */ } = useCart();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const doc = await databases.getDocument<MenuItemDoc>(
          DB_ID,
          MENU_ITEMS_COLLECTION_ID,
          String(id)
        );
        if (mounted) setItem({ ...doc, price: Number(doc.price) });
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

  const showToast = (msg: string) => {
    if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
    else alert(msg);
  };

  const onBack = () => router.back();
  const goCart = () => {
    if (!rId) return;
    router.push(`/cart/${rId}`);
  };

  const total = useMemo(() => {
    if (!item) return 0;
    return Math.max(1, qty) * Number(item.price || 0);
  }, [qty, item]);

  const increment = () => setQty((q) => Math.min(99, q + 1));
  const decrement = () => setQty((q) => Math.max(1, q - 1));

  const handleAdd = () => {
    if (!item) return;

    // If your cart store later exposes hasItem(rId, itemId), use it here.
    if (locallyAdded) {
      showToast("Item is already in your cart.");
      return;
    }

    addItem({
      restaurantId: rId,
      restaurantName: rName,
      item: { id: item.$id, name: item.name, price: Number(item.price), photoId: item.photoId },
      qty,
    });

    setLocallyAdded(true);
    showToast("Added to cart ✓");
  };

  // ——— Loading / Not found states ———
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

  // ——— Derived display helpers ———
  const category = item.category || "Popular";
  const rating = Number(item.rating || 4.6);
  const ratingCount = Number(item.ratingCount || 200);
  const isVeg =
    typeof item.veg === "boolean"
      ? item.veg
      : /paneer|dal|aloo|gobi|veg|raita|naan|chole|chana/i.test(item.name); // tiny heuristic

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {rId ? (
          <TouchableOpacity onPress={goCart} style={styles.iconBtn}>
            <Ionicons name="cart-outline" size={22} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Hero image */}
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

        {/* Meta row: veg dot • category chip • rating */}
        <View style={styles.metaRow}>
          <View style={[styles.vegDot, { backgroundColor: isVeg ? "#16A34A" : "#B91C1C" }]} />
          <Text style={styles.metaText}>{isVeg ? "Veg" : "Non-Veg"}</Text>

          <View style={styles.dot} />

          <View style={styles.chip}>
            <Text style={styles.chipText}>{category}</Text>
          </View>

          <View style={styles.dot} />

          <Ionicons name="star" size={14} />
          <Text style={styles.metaText}>{rating.toFixed(1)} </Text>
          <Text style={[styles.metaText, { opacity: 0.7 }]}>({ratingCount}+)</Text>
        </View>

        {/* Description */}
        {!!item.description && (
          <Text style={styles.desc} numberOfLines={6}>
            {item.description}
          </Text>
        )}

        {/* “Best paired with” placeholders (non-interactive for now, purely visual) */}
        <View style={{ marginTop: 16 }}>
          <Text style={styles.sectionTitle}>Best paired with</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            {["Raita", "Butter Naan", "Jeera Rice"].map((t) => (
              <View key={t} style={styles.suggestCard}>
                <Text style={styles.suggestText}>{t}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={{ height: 88 }} />
      </ScrollView>

      {/* Sticky CTA with qty stepper */}
      <View style={styles.ctaBar}>
        <View style={styles.qtyWrap}>
          <TouchableOpacity onPress={decrement} style={styles.qtyBtn}>
            <Ionicons name="remove" size={18} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{qty}</Text>
          <TouchableOpacity onPress={increment} style={styles.qtyBtn}>
            <Ionicons name="add" size={18} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, locallyAdded && styles.addBtnGhost]}
          onPress={handleAdd}
          activeOpacity={0.9}
        >
          <Text style={[styles.addText, locallyAdded && styles.addTextGhost]}>
            {locallyAdded ? "Already in Cart" : `Add • ₹${total.toFixed(0)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const GREEN = "#22C55E"; // matches your Search/Open Now theme

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },

  topBar: {
    height: 52,
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

  image: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    backgroundColor: "#eee",
    marginBottom: 14,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  title: { flex: 1, fontSize: 24, fontWeight: "800" },

  pricePill: {
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  priceText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  metaRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vegDot: { width: 10, height: 10, borderRadius: 5 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" },
  metaText: { fontSize: 13, fontWeight: "600" },

  chip: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { fontSize: 12, fontWeight: "700" },

  desc: { fontSize: 14, opacity: 0.9, marginTop: 12, lineHeight: 20 },

  sectionTitle: { fontSize: 16, fontWeight: "800" },

  suggestCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    marginRight: 10,
  },
  suggestText: { fontSize: 13, fontWeight: "700" },

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
    gap: 12,
  },

  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  qtyText: { width: 28, textAlign: "center", fontWeight: "800", fontSize: 16 },

  addBtn: {
    flex: 1,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  addText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  addBtnGhost: {
    backgroundColor: "#E9FBEF",
  },
  addTextGhost: {
    color: GREEN,
  },

  backBtn: { paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 16, fontWeight: "700", marginLeft: 4 },
});
