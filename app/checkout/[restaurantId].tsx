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
  RefreshControl,
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

/* ---------- Collections / IDs ---------- */
const DB_ID = appwriteConfig.databaseId;
const ORDERS_COLLECTION_ID = appwriteConfig.ordersCollectionId;
const ADDR_COLLECTION_ID = appwriteConfig.addressesCollectionId;
const MENU_ITEMS = appwriteConfig.menuItemsCollectionId;
const RESTAURANTS = appwriteConfig.Restaurant_Collection_ID;
const PLATFORM_COLLECTION_ID = (appwriteConfig as any).platformCollectionId;
const PLATFORM_DOC_ID = (appwriteConfig as any).PLATFORM_DOC_ID as string;

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

type MenuItemDoc = Models.Document & {
  available?: boolean;
  price?: number;
};

/* ---------- Utils ---------- */
const clamp = (n: number, min = 0) => (n < min ? min : n);

/* ===========================================================
   Checkout Screen
   =========================================================== */
export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Accept optional extras from Cart (we always re-check availability here).
  const {
    restaurantId,
    promoCode: pCode,
    promoDiscount: pDisc,
  } = useLocalSearchParams<{
    restaurantId?: string;
    promoCode?: string;
    promoDiscount?: string;
  }>();

  const rid = String(restaurantId || "");
  const { lines, clearRestaurant, removeItem } = useCart();

  const restLines: CartLine[] = useMemo(
    () => lines.filter((l) => l.restaurantId === rid),
    [lines, rid]
  );
  const restaurantName = restLines[0]?.restaurantName || "Restaurant";

  /* ---------- Platform fees (same as Cart) ---------- */
  const [platformFeeCfg, setPlatformFeeCfg] = useState(5);
  const [deliveryFeeBase, setDeliveryFeeBase] = useState(29);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(399);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!PLATFORM_COLLECTION_ID || !PLATFORM_DOC_ID) return;
        const doc = await databases.getDocument(DB_ID, PLATFORM_COLLECTION_ID, PLATFORM_DOC_ID);
        if (!mounted) return;
        setPlatformFeeCfg(Number((doc as any).platformFee ?? 5));
        setDeliveryFeeBase(Number((doc as any).deliveryFee ?? 29));
        setFreeDeliveryThreshold(Number((doc as any).freeDeliveryThreshold ?? 399));
      } catch {
        // keep defaults on failure
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ---------- Availability: items ---------- */
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [checkingAvail, setCheckingAvail] = useState(false);

  const checkAvailability = useCallback(async () => {
    if (!MENU_ITEMS || restLines.length === 0) {
      setAvailability({});
      return;
    }
    setCheckingAvail(true);
    try {
      const ids = restLines.map((l) => l.item.id);
      const res = await databases.listDocuments<MenuItemDoc>(DB_ID, MENU_ITEMS, [
        Query.equal("$id", ids),
        Query.limit(Math.max(ids.length, 100)),
      ]);
      const map: Record<string, boolean> = {};
      (res.documents || []).forEach((d) => {
        map[d.$id] = (d as any).available !== false; // default true
      });
      ids.forEach((id) => {
        if (!(id in map)) map[id] = true;
      });
      setAvailability(map);
    } catch {
      // assume current state if error
    } finally {
      setCheckingAvail(false);
    }
  }, [restLines]);

  /* ---------- Availability: restaurant open ---------- */
  const [isRestaurantOpen, setIsRestaurantOpen] = useState<boolean | null>(null);
  const [checkingRestaurant, setCheckingRestaurant] = useState(false);

  const checkRestaurantOpen = useCallback(async () => {
    if (!RESTAURANTS || !rid) return;
    setCheckingRestaurant(true);
    try {
      const doc = await databases.getDocument(DB_ID, RESTAURANTS, rid);
      const open = typeof (doc as any).open === "boolean" ? (doc as any).open : true;
      setIsRestaurantOpen(open);
    } catch {
      // if not readable, don't hard-block: assume open
      setIsRestaurantOpen(true);
    } finally {
      setCheckingRestaurant(false);
    }
  }, [rid]);

  /* ---------- Initial checks ---------- */
  useEffect(() => {
    checkAvailability();
    checkRestaurantOpen();
  }, [checkAvailability, checkRestaurantOpen]);

  /* ---------- Available vs Unavailable lines ---------- */
  const availableLines = useMemo(
    () => restLines.filter((l) => availability[l.item.id] !== false),
    [restLines, availability]
  );
  const unavailableLines = useMemo(
    () => restLines.filter((l) => availability[l.item.id] === false),
    [restLines, availability]
  );

  /* ---------- Promo from Cart (optional) ---------- */
  const promoCode = (pCode || "").toString();
  const promoDiscountFromCart = Number(pDisc || 0);

  /* ---------- Totals from *available* lines only ---------- */
  const subTotal = useMemo(
    () => availableLines.reduce((sum, l) => sum + Number(l.item.price) * Number(l.qty), 0),
    [availableLines]
  );

  const promoDiscount = clamp(Math.min(subTotal, promoDiscountFromCart));
  const deliveryFeeRaw = subTotal >= freeDeliveryThreshold ? 0 : deliveryFeeBase;
  const deliveryFee = deliveryFeeRaw; // if you add freeship here, zero when the promo is freeship
  const platformFee = platformFeeCfg;
  const gstBase = Math.max(0, subTotal - promoDiscount) + platformFee + deliveryFee;
  const gst = Math.round(gstBase * 0.05);
  const total = clamp(subTotal - promoDiscount + platformFee + deliveryFee + gst);

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
  const [pendingUPIRef, setPendingUPIRef] = useState<string | null>(null);
  const [prefetchRefId, setPrefetchRefId] = useState<string | null>(null);

  // Prefetch hook: once we have a referenceId, it warms the UPI link.
  const callbackUrl = Linking.createURL(`/orders/${prefetchRefId || ""}`);
  const { ensure: ensureUPILink } = useUPILink({
    referenceId: prefetchRefId || "",
    amount: total,
    name: (() => {
      const a = addresses.find((x) => x.$id === selectedAddrId);
      return a?.fullName;
    })(),
    callbackUrl,
    auto: !!prefetchRefId,
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
            (res.documents ?? []).map((d) => databases.updateDocument(DB_ID, ADDR_COLLECTION_ID, d.$id, {
              isDefault: false,
            }))
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
  const hasAnyAvailable = availableLines.length > 0;
  const isValid = !!selectedAddrId && method !== null && hasAnyAvailable && isRestaurantOpen !== false;

  /* ---------- UPI Prefetch: only when NO unavailable lines and restaurant is open ---------- */
  useEffect(() => {
    if (!showCountdown || method !== "UPI" || !ORDERS_COLLECTION_ID || !selectedAddress || !userId) return;
    if (!hasAnyAvailable || unavailableLines.length > 0) return;
    if (isRestaurantOpen === false) return;

    (async () => {
      try {
        // Pre-create/reuse the pending UPI order using AVAILABLE lines only
        const itemsArr = availableLines.map((l) => ({
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
          discount: promoDiscount,
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
        setPrefetchRefId(referenceId);
        await ensureUPILink();
      } catch {
        // ignore prefetch errors
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
    availableLines,
    subTotal,
    platformFee,
    deliveryFee,
    gst,
    total,
    promoDiscount,
    pendingUPIRef,
    ensureUPILink,
    hasAnyAvailable,
    unavailableLines.length,
    isRestaurantOpen,
  ]);

  /* ---------- Pull to refresh ---------- */
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([checkAvailability(), checkRestaurantOpen()]);
    setRefreshing(false);
  }, [checkAvailability, checkRestaurantOpen]);

  /* ---------- Start order flow ---------- */
  const startPlaceOrder = async () => {
    await Promise.all([checkAvailability(), checkRestaurantOpen()]);

    if (isRestaurantOpen === false) {
      Alert.alert("Restaurant closed", "This restaurant is currently closed. Please try again later.");
      return;
    }

    if (!hasAnyAvailable) {
      Alert.alert(
        "No available items",
        "All items in your cart are currently unavailable. Please remove them to continue.",
        [
          { text: "OK", style: "cancel" },
          {
            text: "Remove all",
            style: "destructive",
            onPress: () => {
              restLines.forEach((l) => removeItem(rid, l.item.id));
              router.replace(`/restaurants/${rid}`);
            },
          },
        ]
      );
      return;
    }

    if (unavailableLines.length > 0) {
      const names = unavailableLines.map((l) => `• ${l.item.name}`).join("\n");
      Alert.alert("Some items are unavailable", `${names}\n\nRemove these and continue?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove & Continue",
          style: "destructive",
          onPress: () => {
            unavailableLines.forEach((l) => removeItem(rid, l.item.id));
            setShowCountdown(true);
          },
        },
      ]);
      return;
    }

    setShowCountdown(true);
  };

  const cancelCountdown = () => setShowCountdown(false);

  /* ---------- Place order ---------- */
  const doPlaceOrder = useCallback(
    async () => {
      setShowCountdown(false);
      if (!ORDERS_COLLECTION_ID || !selectedAddress || !userId) return;

      // Final sanity checks
      await Promise.all([checkAvailability(), checkRestaurantOpen()]);
      if (isRestaurantOpen === false) {
        Alert.alert("Restaurant closed", "This restaurant is currently closed. Please try again later.");
        return;
      }
      if (!hasAnyAvailable) {
        Alert.alert("Cart empty", "No available items to order.");
        return;
      }
      if (unavailableLines.length > 0) {
        Alert.alert("Still unavailable", "Please remove unavailable items first.");
        return;
      }

      setPlacing(true);
      try {
        const itemsArr = availableLines.map((l) => ({
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
          discount: promoDiscount,
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

          await payPendingUPI({
            referenceId,
            amount: total,
            customerName: selectedAddress.fullName,
            onPaid: () => {
              clearRestaurant(rid);
              Alert.alert("Payment received 🎉", "Your order is confirmed.");
            },
            onStillPending: () => {},
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

        clearRestaurant(rid);
        router.replace("/order");
      } catch (e: any) {
        Alert.alert("Failed", e?.message || "Could not place the order.");
      } finally {
        setPlacing(false);
      }
    },
    [
      ORDERS_COLLECTION_ID,
      selectedAddress,
      userId,
      rid,
      restaurantName,
      availableLines,
      unavailableLines.length,
      subTotal,
      platformFee,
      deliveryFee,
      gst,
      total,
      promoDiscount,
      method,
      prefetchRefId,
      pendingUPIRef,
      clearRestaurant,
      router,
      checkAvailability,
      checkRestaurantOpen,
      isRestaurantOpen,
      hasAnyAvailable,
    ]
  );

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
          <TouchableOpacity style={styles.iconBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={20} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryStrip}>
          <View>
            <Text style={{ fontWeight: "900", fontSize: 16 }}>{restaurantName}</Text>
            <Text style={{ color: MUTED, fontWeight: "700" }}>
              Items: {availableLines.length}
              {unavailableLines.length > 0 ? `  •  ${unavailableLines.length} unavailable` : ""}
            </Text>
          </View>
          <View style={styles.totalPill}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>₹ {total.toFixed(0)}</Text>
          </View>
        </View>

        {isRestaurantOpen === false && (
          <View style={styles.closedBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={RED} />
            <Text style={styles.closedText}>Restaurant is closed right now. You can’t place an order.</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.fixBtn}>
              <Text style={styles.fixBtnText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}

        {unavailableLines.length > 0 && (
          <View style={styles.unavailableBanner}>
            <Ionicons name="warning-outline" size={16} color={RED} />
            <Text style={styles.unavailableText}>Some items are unavailable. Remove them to continue.</Text>
            <TouchableOpacity
              onPress={() => {
                unavailableLines.forEach((l) => removeItem(rid, l.item.id));
                checkAvailability();
              }}
              style={styles.fixBtn}
            >
              <Text style={styles.fixBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={styles.sectionLabel}>Saved Addresses</Text>
          {addresses.length === 0 ? (
            <Text style={{ color: MUTED, fontWeight: "700", marginBottom: 10 }}>
              No addresses yet — add one below.
            </Text>
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
          disabled={!isValid || placing || checkingAvail || checkingRestaurant}
          onPress={startPlaceOrder}
          activeOpacity={0.9}
          style={[
            styles.placeBtn,
            { backgroundColor: isValid && !placing && !checkingAvail && !checkingRestaurant ? GREEN : "#9CA3AF" },
          ]}
        >
          <View style={[styles.badge, { backgroundColor: "#14532D" }]}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
            <Text style={styles.badgeText}>Secure</Text>
          </View>
          <Text style={styles.placeText}>
            {placing
              ? method === "UPI"
                ? "Creating Link…"
                : "Placing…"
              : checkingAvail || checkingRestaurant
              ? "Checking availability…"
              : method === "UPI"
              ? "Pay with UPI"
              : "Place Order"}
          </Text>
        </TouchableOpacity>
      </View>

      <PlaceOrderSheet
        visible={showCountdown}
        amount={total}
        methodLabel={
          method === "UPI"
            ? `Pay ₹${total.toFixed(0)} via UPI (Razorpay)`
            : `Pay ₹${total.toFixed(0)} on delivery (UPI/cash)`
        }
        addressTitle={`Delivering to ${selectedAddress?.landmark ? "Home" : selectedAddress?.city || "address"}`}
        addressLine={[selectedAddress?.line1, selectedAddress?.city, selectedAddress?.state, selectedAddress?.country]
          .filter(Boolean)
          .join(", ")}
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

  closedBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  closedText: { color: "#991B1B", fontWeight: "800", flex: 1 },

  unavailableBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unavailableText: { color: "#991B1B", fontWeight: "800", flex: 1 },
  fixBtn: { backgroundColor: "#DC2626", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  fixBtnText: { color: "#fff", fontWeight: "900" },

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
