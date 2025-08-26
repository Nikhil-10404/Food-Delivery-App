// app/orders/[id].tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { databases, appwriteConfig } from "@/lib/appwrite";
import type { Models } from "react-native-appwrite";

const DB_ID = appwriteConfig.databaseId;
const ORDERS_COLLECTION_ID =
  (appwriteConfig as any).ordersCollectionId ||
  (appwriteConfig as any).Orders_Collection_ID;

const PRIMARY = "#111827";
const MUTED   = "#6B7280";
const BORDER  = "#E5E7EB";
const ACCENT  = "#FE8C00";
const RED     = "#DC2626";

type RawOrderDoc = Models.Document & {
  restaurantName: string;
  items: any;          // may be string (JSON) or array
  total: number; subTotal: number; platformFee: number; deliveryFee: number; gst: number; discount: number;
  address: any;        // may be string (JSON) or object
  paymentMethod: "COD" | "UPI" | "CARD" | string;
  paymentStatus: "pending" | "paid" | "failed" | string;
  status: "placed" | "accepted" | "preparing" | "on_the_way" | "delivered" | "cancelled" | string;
  $createdAt: string;
};

type OrderItem = { id: string | number; name: string; price: number; qty: number };
type AddressObj = {
  fullName?: string; phone?: string; line1?: string; line2?: string; landmark?: string;
  city?: string; state?: string; country?: string; pincode?: string;
};

function safeParse<T>(v: any, fallback: T): T {
  try {
    if (typeof v === "string") return JSON.parse(v) as T;
    if (v && typeof v === "object") return v as T;
    return fallback;
  } catch {
    return fallback;
  }
}

export default function OrderDetails() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const oid = String(id || "");

  const [doc, setDoc] = useState<RawOrderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyCancel, setBusyCancel] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const d = await databases.getDocument<RawOrderDoc>(DB_ID, ORDERS_COLLECTION_ID, oid);
        if (!mounted) return;
        setDoc(d);
      } catch (e) {
        console.warn("[OrderDetails] load failed", (e as any)?.message || e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [oid]);

  const created = useMemo(
    () => (doc ? new Date(doc.$createdAt).toLocaleString() : ""),
    [doc]
  );

  const items: OrderItem[] = useMemo(
    () => safeParse<OrderItem[]>(doc?.items, []),
    [doc?.items]
  );

  const address: AddressObj = useMemo(
    () => safeParse<AddressObj>(doc?.address, {}),
    [doc?.address]
  );

  const canCancel = doc?.status === "placed" && doc?.paymentStatus === "pending";

  const onCancel = useCallback(async () => {
    if (!doc) return;
    Alert.alert("Cancel order?", "This will remove the order permanently.", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, cancel",
        style: "destructive",
        onPress: async () => {
          try {
            setBusyCancel(true);
            await databases.deleteDocument(DB_ID, ORDERS_COLLECTION_ID, doc.$id);
            Alert.alert("Cancelled", "Your order has been cancelled.");
            router.replace("/order");
          } catch (e: any) {
            Alert.alert("Failed", e?.message || "Could not cancel the order.");
          } finally {
            setBusyCancel(false);
          }
        },
      },
    ]);
  }, [doc]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", paddingTop: Math.max(insets.top * 0.3, 0) }}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} />
        </TouchableOpacity>
        <Text style={styles.heading}>Order Details</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={{ flex:1, alignItems:"center", justifyContent:"center" }}>
          <ActivityIndicator />
        </View>
      ) : !doc ? (
        <View style={{ flex:1, alignItems:"center", justifyContent:"center" }}>
          <Text>Not found</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(i, idx) => String((i as any)?.id ?? idx)}
            contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
            ListHeaderComponent={
              <View style={styles.card}>
                <Text style={styles.title}>{doc.restaurantName || "Order"}</Text>
                <Text style={{ color: MUTED, marginTop: 2, fontWeight: "700" }}>{created}</Text>

                <View style={styles.row}>
                  <Text style={styles.muted}>Payment</Text>
                  <Text style={styles.bold}>{doc.paymentMethod} • {doc.paymentStatus}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.muted}>Status</Text>
                  <Text style={styles.bold}>{doc.status}</Text>
                </View>

                <View style={[styles.divider, { marginTop: 10 }]} />
                <Text style={[styles.title, { fontSize: 14 }]}>Delivery Address</Text>
                <Text style={{ marginTop: 6, fontWeight: "700" }}>
                  {(address.fullName || "—")} • {(address.phone || "—")}
                </Text>
                {!!address.line1 && <Text style={{ color: MUTED, marginTop: 4 }}>{address.line1}{address.line2 ? `, ${address.line2}` : ""}</Text>}
                <Text style={{ color: MUTED }}>
                  {[address.city, address.state, address.country].filter(Boolean).join(", ")}
                  {address.pincode ? ` - ${address.pincode}` : ""}
                </Text>

                <View style={[styles.divider, { marginTop: 10 }]} />
                <Text style={[styles.title, { fontSize: 14, marginBottom: 8 }]}>Items</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.itemRow}>
                <Text style={{ flex: 1, fontWeight: "800", color: PRIMARY }} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.muted}>x{item.qty}</Text>
                <Text style={styles.bold}>₹ {Number(item.price).toFixed(0)}</Text>
              </View>
            )}
            ListFooterComponent={
              <View style={[styles.card, { marginTop: 12 }]}>
                <View style={styles.row}><Text style={styles.muted}>Subtotal</Text><Text style={styles.bold}>₹ {Number(doc.subTotal || 0).toFixed(0)}</Text></View>
                <View style={styles.row}><Text style={styles.muted}>Platform fee</Text><Text style={styles.bold}>₹ {Number(doc.platformFee || 0).toFixed(0)}</Text></View>
                <View style={styles.row}><Text style={styles.muted}>Delivery</Text><Text style={styles.bold}>{doc.deliveryFee ? `₹ ${Number(doc.deliveryFee).toFixed(0)}` : "FREE"}</Text></View>
                <View style={styles.row}><Text style={styles.muted}>GST (5%)</Text><Text style={styles.bold}>₹ {Number(doc.gst || 0).toFixed(0)}</Text></View>
                {!!doc.discount && <View style={styles.row}><Text style={[styles.muted, { color: ACCENT }]}>Discount</Text><Text style={[styles.bold, { color: ACCENT }]}>– ₹ {Number(doc.discount).toFixed(0)}</Text></View>}
                <View style={styles.divider} />
                <View style={styles.row}><Text style={styles.total}>Total</Text><Text style={styles.total}>₹ {Number(doc.total || 0).toFixed(0)}</Text></View>
              </View>
            }
          />

          {/* Sticky cancel button (only when cancellable) */}
          {canCancel && (
            <View style={styles.sticky}>
              <TouchableOpacity
                onPress={onCancel}
                activeOpacity={0.9}
                style={[styles.cancelBtn, busyCancel && { opacity: 0.7 }]}
                disabled={busyCancel}
              >
                <Ionicons name="close-circle-outline" size={18} color="#fff" />
                <Text style={styles.cancelText}>{busyCancel ? "Cancelling…" : "Cancel Order"}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },

  card: { backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BORDER },
  title: { fontSize: 16, fontWeight: "900", color: PRIMARY },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 6 },

  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  muted: { color: MUTED, fontWeight: "700" },
  bold: { fontWeight: "800" },
  total: { fontSize: 16, fontWeight: "900", color: PRIMARY },

  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: "#fff", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  cancelBtn: { backgroundColor: RED, borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  cancelText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
