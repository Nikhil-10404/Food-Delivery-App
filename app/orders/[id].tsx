// app/orders/[id].tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { databases, appwriteConfig } from "@/lib/appwrite";
import type { Models } from "react-native-appwrite";

import { payPendingUPI } from "@/lib/payments-client";    // 👈 NEW
import { useCart } from "@/store/cart";                    // 👈 NEW

const DB_ID = appwriteConfig.databaseId;
const ORDERS_COLLECTION_ID =
  (appwriteConfig as any).ordersCollectionId ||
  (appwriteConfig as any).Orders_Collection_ID;

const PRIMARY = "#111827";
const MUTED   = "#6B7280";
const BORDER  = "#E5E7EB";
const ACCENT  = "#FE8C00";
const RED     = "#DC2626";
const GREEN   = "#16A34A";

type RawOrderDoc = Models.Document & {
  restaurantId: string;                // 👈 ensure this exists in your Orders collection
  restaurantName: string;
  items: any;                          // may be string (JSON) or array
  total: number; subTotal: number; platformFee: number; deliveryFee: number; gst: number; discount: number;
  address: any;                        // may be string (JSON) or object
  paymentMethod: "COD" | "UPI" | "CARD" | string;
  paymentStatus: "pending" | "paid" | "failed" | string;
  status: "placed" | "accepted" | "preparing" | "on_the_way" | "delivered" | "cancelled" | "pending_payment" | string;
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

  const { clearRestaurant } = useCart();                 // 👈 for emptying cart after successful pay

  const [doc, setDoc] = useState<RawOrderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyCancel, setBusyCancel] = useState(false);
  const [busyPay, setBusyPay] = useState(false);    // 👈 NEW

  useEffect(() => {
    if (doc?.paymentStatus === "paid" && (doc as any)?.restaurantId) {
      clearRestaurant((doc as any).restaurantId); // ✅ self-heal cart on paid orders
    }
  }, [doc?.paymentStatus, (doc as any)?.restaurantId]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await databases.getDocument<RawOrderDoc>(DB_ID, ORDERS_COLLECTION_ID, oid);
      setDoc(d);
    } catch (e) {
      console.warn("[OrderDetails] load failed", (e as any)?.message || e);
    } finally {
      setLoading(false);
    }
  }, [oid]);

  useEffect(() => {
    let mounted = true;
    (async () => { if (mounted) await reload(); })();
    return () => { mounted = false; };
  }, [reload]);

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

  // Cancellation flags
  const canCancelUPI = doc?.paymentMethod === "UPI" && (doc?.status === "pending_payment" || doc?.paymentStatus === "pending");
  const canCancelCOD = doc?.paymentMethod === "COD" && doc?.status === "placed";
  const canCancel = !!(canCancelUPI || canCancelCOD);

  // Show Pay via UPI when it's a pending UPI order
  const canPayUPI = doc?.paymentMethod === "UPI" && doc?.status === "pending_payment";

const cancelOrder = useCallback(async () => {
  if (!doc) return;

  Alert.alert("Cancel order?", "This cannot be undone.", [
    { text: "No", style: "cancel" },
    {
      text: "Yes, cancel",
      style: "destructive",
      onPress: async () => {
        try {
          setBusyCancel(true);

          if (canCancelUPI) {
            const base = process.env.EXPO_PUBLIC_PAYMENTS_URL || 'https://payment-services-d0x2.onrender.com';
            const res = await fetch(`${base}/api/orders/cancel/${doc.$id}`, { method: 'POST' });
            if (!res.ok) throw new Error('Cancel request failed');
          } else if (canCancelCOD) {
            await databases.deleteDocument(DB_ID, ORDERS_COLLECTION_ID, doc.$id);
          }

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
}, [doc, canCancelUPI, canCancelCOD]);


  // 👇 NEW: Pay via UPI for an existing pending order
  const payNow = useCallback(async () => {
    if (!doc) return;
    try {
      setBusyPay(true);
      await payPendingUPI({
        referenceId: doc.$id,
        amount: doc.total,
        customerName: address.fullName,
        onPaid: async () => {
          try {
            // empty the cart for this restaurant
            if (doc.restaurantId) clearRestaurant(doc.restaurantId);
          } catch {}
          Alert.alert("Payment received 🎉", "Your order is confirmed.");
          await reload();                    // refresh doc → should now be paid
          router.replace(`/orders/${doc.$id}`); // stay on details, now as paid
        },
        onStillPending: async () => {
          // just refresh the doc so the latest status is shown
          await reload();
        },
      });
    } finally {
      setBusyPay(false);
    }
  }, [doc, address?.fullName, clearRestaurant, reload, router]);

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
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
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

          {/* Sticky actions */}
          {(canPayUPI || canCancel) ? (
            <View style={styles.sticky}>
              {canPayUPI ? (
                <TouchableOpacity
                  onPress={payNow}
                  activeOpacity={0.9}
                  style={[styles.actionBtn, { backgroundColor: GREEN, marginBottom: 8 }, busyPay && { opacity: 0.7 }]}
                  disabled={busyPay}
                >
                  <Ionicons name="qr-code-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>{busyPay ? "Opening…" : "Pay via UPI"}</Text>
                </TouchableOpacity>
              ) : null}

              {canCancel ? (
                <TouchableOpacity
                  onPress={cancelOrder}
                  activeOpacity={0.9}
                  style={[styles.actionBtn, { backgroundColor: RED }, busyCancel && { opacity: 0.7 }]}
                  disabled={busyCancel}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>{busyCancel ? "Cancelling…" : "Cancel Order"}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
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
  actionBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  actionText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
