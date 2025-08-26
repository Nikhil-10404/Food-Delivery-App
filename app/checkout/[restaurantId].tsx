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
import CountdownSheet from "@/components/checkout/CountdownSheet";
import AddressCard, { Address } from "@/components/checkout/AddressCard";
import AddressForm, { AddressInput } from "@/components/checkout/AddressForm";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import PlaceOrderSheet from "@/components/checkout/PlaceOrderSheet";



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
  items: string; // JSON string
  subTotal: number;
  platformFee: number;
  deliveryFee: number;
  gst: number;
  discount: number;
  total: number;
  address: string; // JSON string
  paymentMethod: "COD" | "UPI" | "CARD";
  paymentStatus: "pending" | "paid";
  status: "placed" | "accepted" | "preparing" | "on_the_way" | "delivered" | "cancelled";
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
  const { restaurantId } = useLocalSearchParams<{ restaurantId?: string }>();
  const rid = String(restaurantId || "");

  const { lines, clearRestaurant } = useCart();
  const restLines: CartLine[] = useMemo(() => lines.filter((l) => l.restaurantId === rid), [lines, rid]);
  const restaurantName = restLines[0]?.restaurantName || "Restaurant";

  /* ---------- Price summary ---------- */
  const subTotal = useMemo(() => restLines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0), [restLines]);
  const platformFee = 5;
  const deliveryFee = subTotal >= 399 ? 0 : 29;
  const gst = Math.round((subTotal + platformFee + deliveryFee) * 0.05);
  const total = Math.max(0, subTotal + platformFee + deliveryFee + gst);

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

  // inside CheckoutScreen component

const deleteAddress = useCallback(async (addrId: string) => {
  if (!ADDR_COLLECTION_ID) return;

  // Optional: confirm
  Alert.alert("Delete address", "Are you sure you want to delete this address?", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: async () => {
        try {
          // find the address so we know if it was default
          const toDelete = addresses.find(a => a.$id === addrId);

          await databases.deleteDocument(DB_ID, ADDR_COLLECTION_ID, addrId);

          // remove locally
          setAddresses(prev => prev.filter(a => a.$id !== addrId));

          // fix selection
          setSelectedAddrId(prevSel => {
            if (prevSel !== addrId) return prevSel; // selection unchanged
            const remaining = addresses.filter(a => a.$id !== addrId);
            const next = remaining.find(a => a.isDefault) || remaining[0] || null;
            return next ? next.$id : null;
          });

          // if we deleted the default, make the first remaining address default in DB (optional but nice)
          if (toDelete?.isDefault) {
            const remaining = addresses.filter(a => a.$id !== addrId);
            const pick = remaining[0];
            if (pick) {
              await databases.updateDocument(DB_ID, ADDR_COLLECTION_ID, pick.$id, { isDefault: true });
              setAddresses(prev => prev.map(a => ({ ...a, isDefault: a.$id === pick.$id })));
            }
          }
        } catch (e: any) {
          Alert.alert("Failed", e?.message || "Could not delete address.");
        }
      },
    },
  ]);
}, [addresses]);


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
      // keep current selection if still present, else pick default or first
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
      // update local
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
        // if set as default, unset others first
        if (data.isDefault) {
          const res = await databases.listDocuments<AddressDoc>(DB_ID, ADDR_COLLECTION_ID, [
            Query.equal("userId", userId),
            Query.limit(100),
          ]);
          await Promise.all(
            (res.documents ?? []).map((d) => databases.updateDocument(DB_ID, ADDR_COLLECTION_ID, d.$id, { isDefault: false }))
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
        // put newly created at top & select it
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

  // inside app/checkout/[restaurantId].tsx
const updateAddress = useCallback(
  async (data: Partial<AddressInput> | AddressInput) => {
    if (!editingAddr || !ADDR_COLLECTION_ID || !userId) return;
    setUpdatingAddr(true);
    try {
      const d = data as Partial<AddressInput>;

      // 1) If setting this as default, unset others first
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

      // 2) MERGE: fall back to existing values when a field isn't provided
      const merged = {
        fullName: (d.fullName ?? editingAddr.fullName).trim(),
        phone: (d.phone ?? editingAddr.phone).trim(),
        line1: (d.line1 ?? editingAddr.line1).trim(),
        landmark: (d.landmark ?? editingAddr.landmark ?? "").trim(),
        pincode: (d.pincode ?? editingAddr.pincode).trim(),
        city: (d.city ?? editingAddr.city).trim(),
        state: (d.state ?? editingAddr.state).trim(),
        country: (d.country ?? editingAddr.country).trim(),
        // if isDefault not supplied, keep previous value
        isDefault: d.isDefault !== undefined ? !!d.isDefault : !!editingAddr.isDefault,
      };

      // 3) Send the merged object (full doc shape) so nothing gets wiped
      const updated = await databases.updateDocument<AddressDoc>(
        DB_ID,
        ADDR_COLLECTION_ID,
        editingAddr.$id,
        merged as any
      );

      // 4) Update local state
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

  /* ---------- Place order with countdown ---------- */
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
        status: "placed",
      };

      const created = await databases.createDocument<OrderDoc>(DB_ID, ORDERS_COLLECTION_ID, "unique()", payload as any);
      setLastOrderId(created.$id);
      clearRestaurant(rid);
      Alert.alert(
  "Order placed 🎉",
  "Your order has been placed successfully!",
  [
    {
      text: "View Order",
      onPress: () => router.replace("/order"),
    },
    { text: "OK", style: "cancel" },
  ]
);

    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not place the order.");
    } finally {
      setPlacing(false);
    }
  }, [ORDERS_COLLECTION_ID, selectedAddress, userId, rid, restaurantName, restLines, subTotal, platformFee, deliveryFee, gst, total, method]);

  const cancelOrder = useCallback(async () => {
    if (!ORDERS_COLLECTION_ID || !lastOrderId) return;
    try {
      await databases.deleteDocument(DB_ID, ORDERS_COLLECTION_ID, lastOrderId);
      setLastOrderId(null);
      Alert.alert("Cancelled", "Your order has been cancelled.");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not cancel the order.");
    }
  }, [lastOrderId]);

  const goBack = () => router.back();

  /* ---------- UI ---------- */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", paddingTop: Math.max(insets.top * 0.3, 0) }}>
      {/* Soft gradient header */}
      <LinearGradient
        colors={["#FFF7ED", "#FFFFFF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ padding: 16, paddingBottom: 10 }}
      >
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
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          keyboardShouldPersistTaps="always"
          removeClippedSubviews={false}
        >
          {/* Address book */}
          <Text style={styles.sectionLabel}>Saved Addresses</Text>
          {addresses.length === 0 ? (
            <Text style={{ color: MUTED, fontWeight: "700", marginBottom: 10 }}>
              No addresses yet — add one below.
            </Text>
          ) : (
           addresses.map(a => (
  <AddressCard
  key={a.$id}
  a={a}
  selected={selectedAddrId === a.$id}
  onPress={() => setSelectedAddrId(a.$id)}
  onMakeDefault={() => makeDefault(a.$id)}
  onEdit={() => beginEdit(a)}             // <-- keep this
  onDelete={() => deleteAddress(a.$id)}    // <-- and this
/>

            ))
          )}

          {/* Add / Edit address */}
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
  onSubmit={updateAddress}        // <- accepts Partial | Full
  submitting={updatingAddr}
  submitLabel="Update Address"
/>
          ) : (
           <AddressForm
  mode="create"
  onSubmit={(d) => addNewAddress(d as AddressInput)}   // cast here
  submitting={savingAddr}
/>
          )}

          {/* Payment method */}
          <Text style={styles.sectionLabel}>Payment Method</Text>
          <View style={[styles.card, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
            <PayOption icon="cash-outline" label="Cash on Delivery" active={method === "COD"} onPress={() => setMethod("COD")} />
            <PayOption icon="qr-code-outline" label="UPI (coming soon)" active={method === "UPI"} onPress={() => setMethod("UPI")} disabled badge="Soon" />
            <PayOption icon="card-outline" label="Credit / Debit Card (coming soon)" active={method === "CARD"} onPress={() => setMethod("CARD")} disabled badge="Soon" />
            <Text style={{ color: MUTED, fontSize: 12, marginTop: 8 }}>
              (Online payments coming next. Select COD to place order.)
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky footer */}
      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
        {!lastOrderId ? (
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
            <Text style={styles.placeText}>{placing ? "Placing…" : "Place Order"}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={cancelOrder} activeOpacity={0.9} style={[styles.placeBtn, { backgroundColor: RED }]}>
            <Ionicons name="close-circle-outline" size={16} color="#fff" />
            <Text style={styles.placeText}>Cancel Order</Text>
          </TouchableOpacity>
        )}
      </View>

      <PlaceOrderSheet
  visible={showCountdown}
  amount={total}
  methodLabel={`Pay ₹${total.toFixed(0)} on delivery (UPI/cash)`}
  addressTitle={`Delivering to ${selectedAddress?.landmark ? "Home" : selectedAddress?.city || "address"}`}
  addressLine={[
    selectedAddress?.line1,
    selectedAddress?.city,
    selectedAddress?.state,
    selectedAddress?.country,
  ].filter(Boolean).join(", ")}
  onCancel={cancelCountdown}
  onDone={doPlaceOrder}
  durationMs={5000}
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

  // no "gap" to avoid text input re-layout issues on Android
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

  // no "gap" here either
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
