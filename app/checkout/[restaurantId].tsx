// app/checkout/[restaurantId].tsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Query, Models } from "react-native-appwrite";

import { useCart, CartLine } from "@/store/cart";
import { databases, appwriteConfig, getCurrentUser } from "@/lib/appwrite";
import AddressCard, { Address } from "@/components/checkout/AddressCard";
import AddressForm, { AddressInput } from "@/components/checkout/AddressForm";
import PlaceOrderSheet from "@/components/checkout/PlaceOrderSheet";
import { calculateTotals } from "@/lib/totals";

import * as Linking from "expo-linking";
import { payPendingUPI } from "@/lib/payments-client";
import { useUPILink } from "@/lib/useUPILink";

/* ---------- Theme ---------- */
const PRIMARY = "#111827";
const BORDER = "#E5E7EB";
const MUTED = "#6B7280";
const ACCENT = "#FE8C00";
const BADGE = "#111827";
const GREEN = "#16A34A";
const RED = "#DC2626";
const TINT = "#F1F5F9";
const TINT2 = "#ECFDF5";

/* ---------- Collections ---------- */
const DB_ID = appwriteConfig.databaseId;
const ORDERS_COLLECTION_ID = appwriteConfig.ordersCollectionId;
const ADDR_COLLECTION_ID = appwriteConfig.addressesCollectionId;

/* ---------- Types ---------- */
type OrderDoc = Models.Document & {
  userId: string;
  restaurantId: string;
  restaurantName: string;
  items: string;
  subTotal: number;
  platformFee: number;
  deliveryFee: number;
  gst: number;
  discount: number;
  total: number;
  address: string;
  paymentMethod: "COD" | "UPI" | "CARD";
  paymentStatus: "pending" | "paid";
  status:
    | "placed"
    | "pending_payment"
    | "accepted"
    | "preparing"
    | "on_the_way"
    | "delivered"
    | "cancelled";
};

type AddressDoc = Models.Document & {
  userId: string;
  fullName: string;
  phone: string;
  line1: string;
  landmark?: string;
  pincode: string;
  city: string;
  state: string;
  country: string;
  isDefault: boolean;
};

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { restaurantId, subTotal: pSub, platformFee: pPlat, deliveryFee: pDel, gst: pGst, total: pTot } =
    useLocalSearchParams<{
      restaurantId?: string;
      subTotal?: string;
      platformFee?: string;
      deliveryFee?: string;
      gst?: string;
      total?: string;
    }>();

  const rid = String(restaurantId || "");
  const { lines, clearRestaurant } = useCart();
  const restLines: CartLine[] = useMemo(() => lines.filter((l) => l.restaurantId === rid), [lines, rid]);
  const restaurantName = restLines[0]?.restaurantName || "Restaurant";

  /* ---------- Price summary ---------- */
  const { subTotal, platformFee, deliveryFee, gst, total } = useMemo(() => {
    if (pSub && pPlat && pDel && pGst && pTot) {
      return {
        subTotal: Number(pSub),
        platformFee: Number(pPlat),
        deliveryFee: Number(pDel),
        gst: Number(pGst),
        total: Number(pTot),
      };
    }
    return calculateTotals(restLines);
  }, [pSub, pPlat, pDel, pGst, pTot, restLines]);

  /* ---------- Payment ---------- */
  const [method, setMethod] = useState<"COD" | "UPI" | "CARD" | null>("COD");

  /* ---------- Addresses ---------- */
  const [userId, setUserId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string | null>(null);
  const [savingAddr, setSavingAddr] = useState(false);

  // Edit flow
  const [editingAddr, setEditingAddr] = useState<Address | null>(null);
  const [updatingAddr, setUpdatingAddr] = useState(false);

  /* ---------- Order flow ---------- */
  const [showCountdown, setShowCountdown] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  // Track an existing pending UPI order, and a prefetch target
  const [pendingUPIRef, setPendingUPIRef] = useState<string | null>(null);
  const [prefetchRefId, setPrefetchRefId] = useState<string | null>(null);

  // Prefetch hook: once we have a referenceId to prefetch for, it warms the link.
  const callbackUrl = Linking.createURL(`/orders/${prefetchRefId || ""}`);
  const { ensure: ensureUPILink } = useUPILink({
    referenceId: prefetchRefId || "",
    amount: total,
    name: (() => {
      const a = addresses.find((x) => x.$id === selectedAddrId);
      return a?.fullName;
    })(),
    callbackUrl,
    auto: !!prefetchRefId, // begin prefetch automatically when we set one
  });

  /* ---------- Load user + addresses ---------- */
  const refreshAddresses = useCallback(
    async (uid?: string) => {
      const meId = uid || userId;
      if (!meId || !ADDR_COLLECTION_ID) return;
      const res = await databases.listDocuments<AddressDoc>(DB_ID, ADDR_COLLECTION_ID, [
        Query.equal("userId", meId),
        Query.limit(100),
      ]);
      const list = (res.documents ?? []) as any as Address[];
      setAddresses(list);
      setSelectedAddrId((prev) => {
        if (prev && list.some((a) => a.$id === prev)) return prev;
        const def = list.find((a) => a.isDefault) || list[0];
        return def ? def.$id : null;
      });
    },
    [userId]
  );

  useEffect(() => {
    (async () => {
      const me = await getCurrentUser().catch(() => null);
      if (!me?.$id) return;
      setUserId(me.$id);
      await refreshAddresses(me.$id);
    })();
  }, [refreshAddresses]);

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.$id === selectedAddrId) || null,
    [addresses, selectedAddrId]
  );

  const makeDefault = useCallback(
    async (addrId: string) => {
      if (!userId || !ADDR_COLLECTION_ID) return;
      const res = await databases.listDocuments<AddressDoc>(DB_ID, ADDR_COLLECTION_ID, [
        Query.equal("userId", userId),
        Query.limit(100),
      ]);
      const docs = res.documents ?? [];
      await Promise.all(
        docs.map((d) => databases.updateDocument(DB_ID, ADDR_COLLECTION_ID, d.$id, { isDefault: d.$id === addrId }))
      );
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.$id === addrId })));
      setSelectedAddrId(addrId);
    },
    [userId]
  );

  const addNewAddress = useCallback(
    async (data: AddressInput) => {
      if (!userId || !ADDR_COLLECTION_ID) return;
      setSavingAddr(true);
      try {
        if (data.isDefault) {
          const res = await databases.listDocuments<AddressDoc>(DB_ID, ADDR_COLLECTION_ID, [
            Query.equal("userId", userId),
            Query.limit(100),
          ]);
          await Promise.all(
            (res.documents ?? []).map((d) =>
              databases.updateDocument(DB_ID, ADDR_COLLECTION_ID, d.$id, { isDefault: false })
            )
          );
        }
        const created = await databases.createDocument<AddressDoc>(DB_ID, ADDR_COLLECTION_ID, "unique()", {
          userId,
          fullName: data.fullName.trim(),
          phone: data.phone.trim(),
          line1: data.line1.trim(),
          landmark: data.landmark?.trim() || "",
          pincode: data.pincode.trim(),
          city: data.city.trim(),
          state: data.state.trim(),
          country: data.country.trim(),
          isDefault: !!data.isDefault,
        } as any);
        setAddresses((prev) => [created as any, ...prev]);
        setSelectedAddrId(created.$id);
      } catch (e: any) {
        Alert.alert("Failed to save", e?.message || "Could not save address.");
      } finally {
        setSavingAddr(false);
      }
    },
    [userId]
  );

  const beginEdit = (a: Address) => setEditingAddr(a);

  const updateAddress = useCallback(
    async (data: Partial<AddressInput> | AddressInput) => {
      if (!editingAddr || !ADDR_COLLECTION_ID || !userId) return;
      setUpdatingAddr(true);
      try {
        const d = data as Partial<AddressInput>;

        if (d.isDefault === true) {
          const res = await databases.listDocuments<AddressDoc>(DB_ID, ADDR_COLLECTION_ID, [
            Query.equal("userId", userId),
            Query.limit(100),
          ]);
          await Promise.all(
            (res.documents ?? []).map((doc) =>
              databases.updateDocument(DB_ID, ADDR_COLLECTION_ID, doc.$id, {
                isDefault: doc.$id === editingAddr.$id,
              })
            )
          );
        }

        const merged = {
          fullName: (d.fullName ?? editingAddr.fullName).trim(),
          phone: (d.phone ?? editingAddr.phone).trim(),
          line1: (d.line1 ?? editingAddr.line1).trim(),
          landmark: (d.landmark ?? editingAddr.landmark ?? "").trim(),
          pincode: (d.pincode ?? editingAddr.pincode).trim(),
          city: (d.city ?? editingAddr.city).trim(),
          state: (d.state ?? editingAddr.state).trim(),
          country: (d.country ?? editingAddr.country).trim(),
          isDefault: d.isDefault !== undefined ? !!d.isDefault : !!editingAddr.isDefault,
        };

        const updated = await databases.updateDocument<AddressDoc>(
          DB_ID,
          ADDR_COLLECTION_ID,
          editingAddr.$id,
          merged as any
        );

        setAddresses((prev) => prev.map((a) => (a.$id === editingAddr.$id ? (updated as any) : a)));
        if (merged.isDefault) setSelectedAddrId(editingAddr.$id);

        setEditingAddr(null);
        Alert.alert("Saved", "Address updated.");
      } catch (e: any) {
        Alert.alert("Failed", e?.message || "Could not update address.");
      } finally {
        setUpdatingAddr(false);
      }
    },
    [editingAddr, userId]
  );

  /* ---------- Validation ---------- */
  const isValid = !!selectedAddrId && method !== null && restLines.length > 0;

  /* ---------- Prefetch: when countdown opens with UPI, create/reuse doc and warm the link ---------- */
  useEffect(() => {
    if (!showCountdown || method !== "UPI" || !ORDERS_COLLECTION_ID || !selectedAddress || !userId) return;

    (async () => {
      try {
        // create/reuse the pending UPI order now (no UI block)
        const itemsArr = restLines.map((l) => ({
          id: l.item.id,
          name: l.item.name,
          price: Number(l.item.price),
          qty: l.qty,
        }));

        const payload: Partial<OrderDoc> = {
          userId,
          restaurantId: rid,
          restaurantName,
          items: JSON.stringify(itemsArr),
          subTotal,
          platformFee,
          deliveryFee,
          gst,
          discount: 0,
          total,
          address: JSON.stringify({
            fullName: selectedAddress.fullName,
            phone: selectedAddress.phone,
            line1: selectedAddress.line1,
            landmark: selectedAddress.landmark || "",
            pincode: selectedAddress.pincode,
            city: selectedAddress.city,
            state: selectedAddress.state,
            country: selectedAddress.country,
            isDefault: !!selectedAddress.isDefault,
          }),
          paymentMethod: "UPI",
          paymentStatus: "pending",
          status: "pending_payment" as any,
        };

        let referenceId = pendingUPIRef;

        if (!referenceId) {
          try {
            const res = await databases.listDocuments<OrderDoc>(DB_ID, ORDERS_COLLECTION_ID, [
              Query.equal("userId", userId),
              Query.equal("restaurantId", rid),
              Query.equal("paymentMethod", "UPI"),
              Query.equal("status", "pending_payment"),
              Query.orderDesc("$createdAt"),
              Query.limit(1),
            ]);
            const existing = res.documents?.[0];
            if (existing?.$id) referenceId = existing.$id;
          } catch {}
        }

        if (!referenceId) {
          const created = await databases.createDocument<OrderDoc>(
            DB_ID,
            ORDERS_COLLECTION_ID,
            "unique()",
            payload as any
          );
          await databases.updateDocument(DB_ID, ORDERS_COLLECTION_ID, created.$id, {
            referenceId: created.$id,
          });
          referenceId = created.$id;
        } else {
          await databases.updateDocument(DB_ID, ORDERS_COLLECTION_ID, referenceId, {
            total,
            items: JSON.stringify(itemsArr),
          });
        }

        setPendingUPIRef(referenceId);
        setPrefetchRefId(referenceId); // triggers useUPILink(auto) to warm the link
        // ensure explicitly (parallel), just in case auto is delayed by React scheduling
        await ensureUPILink();
      } catch {
        // ignore prefetch errors; payPendingUPI will still handle on press
      }
    })();
  }, [
    showCountdown,
    method,
    ORDERS_COLLECTION_ID,
    selectedAddress,
    userId,
    rid,
    restaurantName,
    restLines,
    subTotal,
    platformFee,
    deliveryFee,
    gst,
    total,
    pendingUPIRef,
    ensureUPILink,
  ]);

  /* ---------- Place order ---------- */
  const startPlaceOrder = () => {
    if (!isValid) {
      Alert.alert("Missing details", "Please select an address and payment method.");
      return;
    }
    setShowCountdown(true);
  };
  const cancelCountdown = () => setShowCountdown(false);

  const doPlaceOrder = useCallback(async () => {
    setShowCountdown(false);
    if (!ORDERS_COLLECTION_ID || !selectedAddress || !userId) return;

    setPlacing(true);
    try {
      const itemsArr = restLines.map((l) => ({
        id: l.item.id,
        name: l.item.name,
        price: Number(l.item.price),
        qty: l.qty,
      }));

      const payload: Partial<OrderDoc> = {
        userId,
        restaurantId: rid,
        restaurantName,
        items: JSON.stringify(itemsArr),
        subTotal,
        platformFee,
        deliveryFee,
        gst,
        discount: 0,
        total,
        address: JSON.stringify({
          fullName: selectedAddress.fullName,
          phone: selectedAddress.phone,
          line1: selectedAddress.line1,
          landmark: selectedAddress.landmark || "",
          pincode: selectedAddress.pincode,
          city: selectedAddress.city,
          state: selectedAddress.state,
          country: selectedAddress.country,
          isDefault: !!selectedAddress.isDefault,
        }),
        paymentMethod: method!,
        paymentStatus: "pending",
        status: method === "UPI" ? ("pending_payment" as any) : "placed",
      };

      if (method === "UPI") {
        // Use the prefetched reference if available
        let referenceId = prefetchRefId || pendingUPIRef;

        if (!referenceId) {
          try {
            const res = await databases.listDocuments<OrderDoc>(DB_ID, ORDERS_COLLECTION_ID, [
              Query.equal("userId", userId),
              Query.equal("restaurantId", rid),
              Query.equal("paymentMethod", "UPI"),
              Query.equal("status", "pending_payment"),
              Query.orderDesc("$createdAt"),
              Query.limit(1),
            ]);
            const existing = res.documents?.[0];
            if (existing?.$id) referenceId = existing.$id;
          } catch {}
        }

        if (!referenceId) {
          const created = await databases.createDocument<OrderDoc>(
            DB_ID,
            ORDERS_COLLECTION_ID,
            "unique()",
            payload as any
          );
          await databases.updateDocument(DB_ID, ORDERS_COLLECTION_ID, created.$id, {
            referenceId: created.$id,
          });
          referenceId = created.$id;
        } else {
          await databases.updateDocument(DB_ID, ORDERS_COLLECTION_ID, referenceId, {
            total,
            items: JSON.stringify(itemsArr),
          });
        }

        setPendingUPIRef(referenceId);
        setPrefetchRefId(referenceId);

        // Launch UPI (now server is already warm; should feel instant)
        await payPendingUPI({
          referenceId,
          amount: total,
          customerName: selectedAddress.fullName,
          onPaid: () => {
            setPendingUPIRef(null);
            clearRestaurant(rid);
            Alert.alert("Payment received 🎉", "Your order is confirmed.");
          },
          onStillPending: () => {
            // user closed or still pending – show Pay button again
          },
        });

        setPlacing(false);
        return;
      }

      // ---------- COD FLOW ----------
      const created = await databases.createDocument<OrderDoc>(
        DB_ID,
        ORDERS_COLLECTION_ID,
        "unique()",
        payload as any
      );
      await databases.updateDocument(DB_ID, ORDERS_COLLECTION_ID, created.$id, {
        referenceId: created.$id,
      });

      setLastOrderId(created.$id);
      clearRestaurant(rid);
      router.replace("/order"); // go to order list quietly
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not place the order.");
    } finally {
      setPlacing(false);
    }
  }, [
    ORDERS_COLLECTION_ID,
    selectedAddress,
    userId,
    rid,
    restaurantName,
    restLines,
    subTotal,
    platformFee,
    deliveryFee,
    gst,
    total,
    method,
    prefetchRefId,
    pendingUPIRef,
    clearRestaurant,
    router,
  ]);

  const deleteAddress = useCallback(
    async (addrId: string) => {
      if (!ADDR_COLLECTION_ID) return;
      Alert.alert("Delete address", "Are you sure you want to delete this address?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const toDelete = addresses.find((a) => a.$id === addrId);
              await databases.deleteDocument(DB_ID, ADDR_COLLECTION_ID, addrId);
              setAddresses((prev) => prev.filter((a) => a.$id !== addrId));
              setSelectedAddrId((prevSel) => {
                if (prevSel !== addrId) return prevSel;
                const remaining = addresses.filter((a) => a.$id !== addrId);
                const next = remaining.find((a) => a.isDefault) || remaining[0] || null;
                return next ? next.$id : null;
              });
              if (toDelete?.isDefault) {
                const remaining = addresses.filter((a) => a.$id !== addrId);
                const pick = remaining[0];
                if (pick) {
                  await databases.updateDocument(DB_ID, ADDR_COLLECTION_ID, pick.$id, { isDefault: true });
                  setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.$id === pick.$id })));
                }
              }
            } catch (e: any) {
              Alert.alert("Failed", e?.message || "Could not delete address.");
            }
          },
        },
      ]);
    },
    [addresses]
  );

  const goBack = () => router.back();

  /* ---------- UI ---------- */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", paddingTop: Math.max(insets.top * 0.3, 0) }}>
      <LinearGradient colors={["#FFF7ED", "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ padding: 16, paddingBottom: 10 }}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={goBack}>
            <Ionicons name="chevron-back" size={22} />
          </TouchableOpacity>
          <Text style={styles.heading}>Checkout</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.summaryStrip}>
          <View>
            <Text style={{ fontWeight: "900", fontSize: 16 }}>{restaurantName}</Text>
            <Text style={{ color: MUTED, fontWeight: "700" }}>Items: {restLines.length}</Text>
          </View>
          <View style={styles.totalPill}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>₹ {total.toFixed(0)}</Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.select({ ios: 80, android: 0 }) as number}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="always" removeClippedSubviews={false}>
          <Text style={styles.sectionLabel}>Saved Addresses</Text>
          {addresses.length === 0 ? (
            <Text style={{ color: MUTED, fontWeight: "700", marginBottom: 10 }}>No addresses yet — add one below.</Text>
          ) : (
            addresses.map((a) => (
              <AddressCard
                key={a.$id}
                a={a}
                selected={selectedAddrId === a.$id}
                onPress={() => setSelectedAddrId(a.$id)}
                onMakeDefault={() => makeDefault(a.$id)}
                onEdit={() => beginEdit(a)}
                onDelete={() => deleteAddress(a.$id)}
              />
            ))
          )}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.sectionLabel}>{editingAddr ? "Edit Address" : "Add New Address"}</Text>
            {editingAddr ? (
              <TouchableOpacity onPress={() => setEditingAddr(null)} style={{ padding: 6 }}>
                <Text style={{ color: "#2563EB", fontWeight: "800" }}>Cancel</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {editingAddr ? (
            <AddressForm
              mode="edit"
              initial={{
                fullName: editingAddr.fullName,
                phone: editingAddr.phone,
                line1: editingAddr.line1,
                landmark: editingAddr.landmark,
                pincode: editingAddr.pincode,
                city: editingAddr.city,
                state: editingAddr.state,
                country: editingAddr.country,
                isDefault: editingAddr.isDefault,
              }}
              onSubmit={updateAddress}
              submitting={updatingAddr}
              submitLabel="Update Address"
            />
          ) : (
            <AddressForm mode="create" onSubmit={(d) => addNewAddress(d as AddressInput)} submitting={savingAddr} />
          )}

          <Text style={styles.sectionLabel}>Payment Method</Text>
          <View style={[styles.card, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
            <PayOption icon="cash-outline" label="Cash on Delivery" active={method === "COD"} onPress={() => setMethod("COD")} />
            <PayOption icon="qr-code-outline" label="UPI (Razorpay)" active={method === "UPI"} onPress={() => setMethod("UPI")} />
            <PayOption icon="card-outline" label="Credit / Debit Card (coming soon)" active={method === "CARD"} onPress={() => setMethod("CARD")} disabled badge="Soon" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky footer */}
      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
        <TouchableOpacity
          disabled={!isValid || placing}
          onPress={startPlaceOrder}
          activeOpacity={0.9}
          style={[styles.placeBtn, { backgroundColor: isValid && !placing ? GREEN : "#9CA3AF" }]}
        >
          <View style={[styles.badge, { backgroundColor: "#14532D" }]}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
            <Text style={styles.badgeText}>Secure</Text>
          </View>
          <Text style={styles.placeText}>{method === "UPI" ? (placing ? "Creating Link…" : "Pay with UPI") : placing ? "Placing…" : "Place Order"}</Text>
        </TouchableOpacity>
      </View>

      <PlaceOrderSheet
        visible={showCountdown}
        amount={total}
        methodLabel={method === "UPI" ? `Pay ₹${total.toFixed(0)} via UPI (Razorpay)` : `Pay ₹${total.toFixed(0)} on delivery (UPI/cash)`}
        addressTitle={`Delivering to ${selectedAddress?.landmark ? "Home" : selectedAddress?.city || "address"}`}
        addressLine={[selectedAddress?.line1, selectedAddress?.city, selectedAddress?.state, selectedAddress?.country].filter(Boolean).join(", ")}
        onCancel={cancelCountdown}
        onDone={doPlaceOrder}
        durationMs={4000}
      />
    </SafeAreaView>
  );
}

/* ---------- Payment option row ---------- */
function PayOption({
  icon,
  label,
  active,
  onPress,
  disabled,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <TouchableOpacity
      onPress={!disabled ? onPress : undefined}
      activeOpacity={0.9}
      style={[styles.payRow, active ? { borderColor: GREEN, backgroundColor: TINT2 } : null, disabled ? { opacity: 0.6 } : null]}
    >
      <View style={[styles.iconCircle, active ? { backgroundColor: PRIMARY } : null]}>
        <Ionicons name={icon} size={18} color={active ? "#fff" : PRIMARY} />
      </View>
      <Text style={{ flex: 1, fontWeight: "800", color: PRIMARY }}>{label}</Text>
      {badge ? <Text style={styles.soon}>{badge}</Text> : null}
      <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={PRIMARY} />
    </TouchableOpacity>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  topBar: { height: 50, flexDirection: "row", alignItems: "center" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },

  summaryStrip: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalPill: { backgroundColor: ACCENT, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },

  sectionLabel: { marginTop: 14, marginBottom: 8, marginLeft: 6, color: PRIMARY, fontWeight: "900", fontSize: 14 },

  card: { backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BORDER, marginBottom: 12 },

  payRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: TINT,
  },

  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    marginRight: 12,
  },
  soon: { color: "#9CA3AF", fontSize: 11, fontWeight: "900", marginRight: 8 },

  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  placeBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  placeText: { color: "#fff", fontSize: 16, fontWeight: "900", marginLeft: 10 },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BADGE,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 10,
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "800", marginLeft: 6 },
});
