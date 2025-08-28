// app/orders/index.tsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { databases, appwriteConfig, getCurrentUser } from "@/lib/appwrite";
import { Models, Query } from "react-native-appwrite";

const DB_ID = appwriteConfig.databaseId;
const ORDERS_COLLECTION_ID =
  (appwriteConfig as any).ordersCollectionId ||
  (appwriteConfig as any).Orders_Collection_ID;

/* ---------- Theme ---------- */
const PRIMARY = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const CARD_BG = "#F9FAFB";

/* ---------- Paging ---------- */
const PAGE = 12;

/* ---------- Tabs ---------- */
const TABS = ["Pending", "Paid", "Failed"] as const;
type Tab = typeof TABS[number];

/* ---------- Raw doc ---------- */
type RawOrderDoc = Models.Document & {
  userId: string;
  restaurantId: string;
  restaurantName: string;
  items: string; // JSON string
  subTotal: number;
  platformFee: number;
  deliveryFee: number;
  gst: number;
  discount: number;
  total: number;
  address: string; // JSON string
  paymentMethod: "COD" | "UPI" | "CARD";
  paymentStatus: "pending" | "paid" | "failed";
  status:
    | "placed"
    | "accepted"
    | "preparing"
    | "on_the_way"
    | "delivered"
    | "cancelled"; // (your enum)
  $createdAt: string;
};

/* ---------- Parsed ---------- */
type ParsedOrder = Omit<RawOrderDoc, "items" | "address"> & {
  items: { id: string | number; name: string; price: number; qty: number }[];
  address: {
    fullName: string;
    phone: string;
    line1: string;
    landmark?: string;
    pincode: string;
    city: string;
    state: string;
    country: string;
    isDefault?: boolean;
  } | null;
};

/* ---------- Helpers ---------- */
function safeParse<T>(s: any, fallback: T): T {
  try {
    return typeof s === "string" ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

export default function OrdersListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Pending");

  const [orders, setOrders] = useState<ParsedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadLock = useRef(false);

  useEffect(() => {
    (async () => {
      const me = await getCurrentUser().catch(() => null);
      setUserId(me?.$id || null);
    })();
  }, []);

  const sinceISO = useMemo(
    () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    []
  );

  const fetchPage = useCallback(
    async (reset = false) => {
      if (!userId || loadLock.current) return;
      loadLock.current = true;
      reset ? setLoading(true) : setLoadingMore(true);
      try {
        const q: any[] = [
          Query.equal("userId", userId),
          Query.limit(PAGE),
          Query.orderDesc("$createdAt"),
        ];
        // cursor paging
        if (!reset && cursor) q.push(Query.cursorAfter(cursor));

        // tab filters
        if (tab === "Pending") {
          q.push(Query.equal("paymentStatus", "pending"));
        } else if (tab === "Paid") {
          q.push(
            Query.equal("paymentStatus", "paid"),
            Query.greaterThanEqual("$createdAt", sinceISO)
          );
        } else {
          q.push(
            Query.equal("paymentStatus", "failed"),
            Query.greaterThanEqual("$createdAt", sinceISO)
          );
        }

        const res = await databases.listDocuments<RawOrderDoc>(
          DB_ID,
          ORDERS_COLLECTION_ID,
          q
        );

        const docs = (res.documents ?? []).map<ParsedOrder>((d) => ({
          ...d,
          items: safeParse<
            { id: string | number; name: string; price: number; qty: number }[]
          >(d.items, []),
          address: safeParse<ParsedOrder["address"]>(d.address, null),
        }));

        setOrders((prev) => (reset ? docs : [...prev, ...docs]));
        setCursor(docs.length === PAGE ? docs[docs.length - 1].$id : null);
      } catch (e: any) {
        console.warn("[Orders] list failed", e?.message || e);
        if (reset) setOrders([]);
      } finally {
        reset ? setLoading(false) : setLoadingMore(false);
        loadLock.current = false;
      }
    },
    [userId, cursor, tab, sinceISO]
  );

  // initial load + when userId available + when tab changes
  useEffect(() => {
    if (!userId) return;
    setCursor(null);
    fetchPage(true);
  }, [userId, tab]);

  const onRefresh = async () => {
    setRefreshing(true);
    setCursor(null);
    await fetchPage(true);
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: ParsedOrder }) => {
    const created = new Date(item.$createdAt);
    const date = created.toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const itemsCount =
      item.items?.reduce((s, it) => s + Number(it.qty || 0), 0) || 0;

    const showPendingBadge = item.paymentStatus === "pending";

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() =>
          router.push({ pathname: "/orders/[id]", params: { id: item.$id } })
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={styles.iconCircle}>
            <Ionicons name="restaurant-outline" size={18} color={PRIMARY} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {item.restaurantName || "Order"}
            </Text>
            <Text style={styles.sub}>
              {date} • {itemsCount} {itemsCount === 1 ? "item" : "items"}
            </Text>
          </View>

          {/* Status pill, but if payment pending, show a stronger badge */}
          {showPendingBadge ? (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>Payment Pending</Text>
            </View>
          ) : (
            <StatusPill status={item.status} />
          )}
        </View>

        <View style={styles.row}>
          <Text style={styles.muted}>Payment</Text>
          <Text style={styles.bold}>
            {item.paymentMethod} • {item.paymentStatus}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Total</Text>
          <Text style={styles.total}>
            ₹ {Number(item.total || 0).toFixed(0)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: "#fff",
        paddingTop: Math.max(insets.top * 0.3, 0),
      }}
    >
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} />
        </TouchableOpacity>
        <Text style={styles.heading}>My Orders</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[
              styles.tabChip,
              tab === t ? styles.tabChipActive : undefined,
            ]}
          >
            <Text
              style={[
                styles.tabChipText,
                tab === t ? styles.tabChipTextActive : undefined,
              ]}
            >
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab !== "Pending" ? (
        <Text style={styles.hint}>Showing last 30 days</Text>
      ) : null}

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bag-outline" size={42} color={MUTED} />
          <Text style={{ marginTop: 8, fontWeight: "900" }}>No orders</Text>
          <Text style={{ color: MUTED, marginTop: 6 }}>
            {tab === "Pending"
              ? "No pending payments right now."
              : "No orders in this period."}
          </Text>
          <TouchableOpacity
            style={styles.cta}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.ctaText}>Browse Restaurants</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(d) => d.$id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 18 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (cursor && !loadingMore) fetchPage(false);
          }}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 12 }} />
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}

function StatusPill({ status }: { status: ParsedOrder["status"] }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    placed: { bg: "#EFF6FF", fg: "#1D4ED8", label: "Placed" },
    accepted: { bg: "#ECFDF5", fg: "#059669", label: "Accepted" },
    preparing: { bg: "#FEF3C7", fg: "#B45309", label: "Preparing" },
    on_the_way: { bg: "#E0F2FE", fg: "#0369A1", label: "On the way" },
    delivered: { bg: "#F0FDF4", fg: "#15803D", label: "Delivered" },
    cancelled: { bg: "#FEF2F2", fg: "#B91C1C", label: "Cancelled" },
  };
  const s = map[status] || map["placed"];
  return (
    <View
      style={{
        backgroundColor: s.bg,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: s.fg, fontWeight: "900", fontSize: 12 }}>
        {s.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },

  tabs: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 6,
  },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    marginRight: 8,
  },
  tabChipActive: {
    backgroundColor: PRIMARY,
  },
  tabChipText: {
    fontWeight: "800",
    color: PRIMARY,
  },
  tabChipTextActive: {
    color: "#fff",
  },
  hint: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    color: MUTED,
    fontWeight: "700",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: CARD_BG,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  title: { fontSize: 16, fontWeight: "900", color: PRIMARY },
  sub: { color: MUTED, marginTop: 2, fontWeight: "700" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  muted: { color: MUTED, fontWeight: "700" },
  bold: { fontWeight: "800" },
  total: { fontSize: 16, fontWeight: "900", color: PRIMARY },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  cta: {
    marginTop: 14,
    backgroundColor: PRIMARY,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  ctaText: { color: "#fff", fontWeight: "900" },

  // payment pending badge
  pendingBadge: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pendingBadgeText: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 12,
  },
});
