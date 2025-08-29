// app/cart/[restaurantId].tsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Alert,
  TextInput,
  Platform,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCart, CartLine } from "@/store/cart";
import { databases, appwriteConfig, getCurrentUser } from "@/lib/appwrite";
import { Models, Query } from "react-native-appwrite";
import { useFocusEffect } from "@react-navigation/native";

/* ---------- Theme ---------- */
const PRIMARY = "#111827";
const ACCENT = "#FE8C00";
const DANGER = "#EF4444";
const MUTED = "#6B7280";
const CARD_BG = "#F9FAFB";
const BORDER = "#E5E7EB";
const BADGE = "#111827";

/* ---------- Collections / IDs ---------- */
const DB_ID = appwriteConfig.databaseId;
const PLATFORM_COLLECTION_ID = (appwriteConfig as any).platformCollectionId;
const COUPONS_COLLECTION_ID = (appwriteConfig as any).couponsCollectionId;
const INSTR_COLLECTION_ID = (appwriteConfig as any).instructionsCollectionId;
const MENU_ITEMS_ID = appwriteConfig.menuItemsCollectionId;

const PLATFORM_DOC_ID = process.env.EXPO_PUBLIC_APPWRITE_PLATFORM_DOC_ID!;

/* ---------- Types ---------- */
type PlatformDoc = Models.Document & {
  platformFee: number;
  deliveryFee: number;
  freeDeliveryThreshold: number;
};
type CouponDoc = Models.Document & {
  restaurantId: string;
  code: string;
  type: "fixed" | "percentage" | "freeship";
  value: number;
  minSubtotal: number;
  activeUntil?: string; // ISO
  isActive: boolean;
  title?: string;
};
type InstructionDoc = Models.Document & {
  restaurantId: string;
  userId: string;
  note: string;
  status: "new" | "read";
  cartSnapshot: string;
};
type MenuItemDoc = Models.Document & {
  available?: boolean;
  price?: number;
};

/* ---------- Helpers ---------- */
const fmtDate = (iso?: string) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
};
const daysLeft = (iso?: string) => {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};
const clamp = (n: number, min = 0) => (n < min ? min : n);

export default function RestaurantCartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { restaurantId, back } = useLocalSearchParams<{ restaurantId?: string; back?: string }>();
  const rid = String(restaurantId || "");
  const safeBack = typeof back === "string" && back.startsWith("/") ? back : undefined;

  const { lines: storeLines, updateQty, removeItem, clearRestaurant } = useCart();
  const lines = Array.isArray(storeLines) ? storeLines : [];
  const restLines: CartLine[] = useMemo(() => lines.filter((l) => l.restaurantId === rid), [lines, rid]);
  const restaurantName = restLines[0]?.restaurantName || "Cart";

  /* ---------- Availability ---------- */
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const checkAvailability = useCallback(async () => {
    if (!MENU_ITEMS_ID || restLines.length === 0) {
      setAvailability({});
      return;
    }
    try {
      const ids = restLines.map((l) => l.item.id);
      const res = await databases.listDocuments<MenuItemDoc>(DB_ID, MENU_ITEMS_ID, [
        Query.equal("$id", ids),
        Query.limit(ids.length || 100),
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
      // ignore errors
    }
  }, [restLines]);

  // refresh on focus + gentle poll
  useFocusEffect(
    useCallback(() => {
      checkAvailability();
      const t = setInterval(checkAvailability, 15000);
      return () => clearInterval(t);
    }, [checkAvailability])
  );

  // pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await checkAvailability();
    } finally {
      setRefreshing(false);
    }
  }, [checkAvailability]);

  const availableLines = useMemo(
    () => restLines.filter((l) => availability[l.item.id] !== false),
    [restLines, availability]
  );
  const unavailableLines = useMemo(
    () => restLines.filter((l) => availability[l.item.id] === false),
    [restLines, availability]
  );

  /* ---------- Remote config ---------- */
  const [platformFee, setPlatformFee] = useState(5);
  const [deliveryFeeBase, setDeliveryFeeBase] = useState(29);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(399);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!PLATFORM_DOC_ID) {
          console.warn("[Cart] PLATFORM_DOC_ID missing; using safe defaults");
          return;
        }
        const doc = await databases.getDocument<PlatformDoc>(DB_ID, PLATFORM_COLLECTION_ID, PLATFORM_DOC_ID);
        if (!mounted) return;
        setPlatformFee(Number(doc.platformFee ?? 5));
        setDeliveryFeeBase(Number(doc.deliveryFee ?? 29));
        setFreeDeliveryThreshold(Number(doc.freeDeliveryThreshold ?? 399));
      } catch (e) {
        console.warn("[Cart] platform config load failed", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ---------- Coupons ---------- */
  const [availableCoupons, setAvailableCoupons] = useState<CouponDoc[]>([]);
  const [promo, setPromo] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponDoc | null>(null);

  // load restaurant coupons
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!COUPONS_COLLECTION_ID || !rid) {
          setAvailableCoupons([]);
          return;
        }

        const res = await databases.listDocuments<CouponDoc>(DB_ID, COUPONS_COLLECTION_ID, [
          Query.equal("restaurantId", rid),
          Query.equal("isActive", true),
          Query.limit(100),
        ]);

        const now = Date.now();

        let list = (res.documents ?? [])
          .filter((c) => !c.activeUntil || Date.parse(c.activeUntil) >= now)
          .map((c) => ({ ...c, code: String(c.code || "").toUpperCase() }));

        list = list.sort((a, b) => {
          const da = a.activeUntil ? Date.parse(a.activeUntil) : Infinity;
          const db = b.activeUntil ? Date.parse(b.activeUntil) : Infinity;
          if (da !== db) return da - db;
          const weight = (c: CouponDoc) =>
            c.type === "percentage" ? c.value * 1000 : c.type === "fixed" ? c.value * 10 : 1;
          return weight(b) - weight(a);
        });

        if (mounted) setAvailableCoupons(list);
      } catch (e) {
        console.warn("[Cart] coupons load failed", e);
        if (mounted) setAvailableCoupons([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [rid]);

  const liveCoupons = useMemo(
    () => availableCoupons.filter((c) => !c.activeUntil || Date.parse(c.activeUntil) >= Date.now()),
    [availableCoupons]
  );

  /* ---------- Price breakdown (AVAILABLE lines only) ---------- */
  const subTotal = useMemo(
    () => availableLines.reduce((sum, l) => sum + Number(l.item.price) * Number(l.qty), 0),
    [availableLines]
  );

  // keep applied coupon valid as cart/clock changes — use subTotal of AVAILABLE only
  useEffect(() => {
    if (!appliedCoupon) return;
    const notExpired = !appliedCoupon.activeUntil || Date.parse(appliedCoupon.activeUntil) >= Date.now();
    const meetsMin = subTotal >= Number(appliedCoupon.minSubtotal || 0);
    if (!notExpired || !meetsMin || appliedCoupon.isActive === false) {
      setAppliedCoupon(null);
    }
  }, [appliedCoupon, subTotal]);

  const validCoupon = useMemo(() => {
    if (!appliedCoupon) return null;
    const now = Date.now();
    if (appliedCoupon.minSubtotal && subTotal < Number(appliedCoupon.minSubtotal)) return null;
    if (appliedCoupon.activeUntil && Date.parse(appliedCoupon.activeUntil) < now) return null;
    if (appliedCoupon.isActive === false) return null;
    return appliedCoupon;
  }, [appliedCoupon, subTotal]);

  const deliveryFeeRaw = subTotal >= freeDeliveryThreshold ? 0 : deliveryFeeBase;
  const deliveryFee = validCoupon?.type === "freeship" ? 0 : deliveryFeeRaw;

  const promoDiscount = useMemo(() => {
    if (!validCoupon) return 0;
    if (validCoupon.type === "fixed") return clamp(Number(validCoupon.value || 0));
    if (validCoupon.type === "percentage") {
      const pct = clamp(Number(validCoupon.value || 0));
      return Math.round((subTotal * pct) / 100);
    }
    return 0;
  }, [validCoupon, subTotal]);

  const GST_RATE = 0.05;
  const gstBase = Math.max(0, subTotal - promoDiscount) + platformFee + deliveryFee;
  const gst = Math.round(gstBase * GST_RATE);
  const total = clamp(subTotal - promoDiscount + platformFee + deliveryFee + gst);

  const progressToFree = Math.max(0, freeDeliveryThreshold - subTotal);
  const freePct = Math.min(1, subTotal / freeDeliveryThreshold);

  /* ---------- Actions ---------- */
  const inc = (line: CartLine) => updateQty(rid, line.item.id, line.qty + 1);
  const dec = (line: CartLine) => updateQty(rid, line.item.id, Math.max(1, line.qty - 1));

  const onBack = () => {
    // @ts-ignore
    if ((router as any).canGoBack?.()) return router.back();
    if (safeBack) return router.replace(safeBack as any);
    if (rid) return router.replace(`/restaurants/${rid}`);
    router.replace("/");
  };

  const goAddMore = () => {
    if (rid) {
      // @ts-ignore
      router.replace({ pathname: "/restaurants/[id]", params: { id: rid } });
    } else {
      router.replace("/");
    }
  };

  const applyPromo = useCallback(() => {
    const code = promo.trim().toUpperCase();
    if (!code) return;

    const found = liveCoupons.find((c) => c.code.toUpperCase() === code);
    if (!found) {
      setAppliedCoupon(null);
      Alert.alert("Invalid code", "This coupon isn’t available right now.");
      return;
    }

    const need = Number(found.minSubtotal || 0);
    if (subTotal < need) {
      setAppliedCoupon(null);
      Alert.alert("Not eligible yet", `Add ₹${(need - subTotal).toFixed(0)} more to use ${found.code}.`);
      return;
    }

    setAppliedCoupon(found);
    Alert.alert("Promo applied", found.title || found.code);
  }, [promo, liveCoupons, subTotal]);

  const tapCoupon = useCallback((c: CouponDoc) => {
    setPromo(c.code.toUpperCase());
    setAppliedCoupon(c);
  }, []);

  /* ---------- Notes ---------- */
  const [note, setNote] = useState("");
  const [noteSending, setNoteSending] = useState(false);

  const sendNote = useCallback(async () => {
    const trimmed = note.trim();
    if (!trimmed) {
      Alert.alert("Note is empty", "Type your instruction first.");
      return;
    }
    if (!INSTR_COLLECTION_ID) {
      Alert.alert("Not configured", "Instructions collection ID is missing.");
      return;
    }
    setNoteSending(true);
    try {
      const me = await getCurrentUser().catch(() => null);
      if (!me?.$id) {
        Alert.alert("Sign in required", "Please sign in to leave instructions.");
        return;
      }
      const snapshot = JSON.stringify(
        restLines.map((l) => ({
          restaurantId: l.restaurantId,
          restaurantName: l.restaurantName,
          item: { id: l.item.id, name: l.item.name, price: l.item.price, photoId: l.item.photoId },
          qty: l.qty,
        }))
      );

      await databases.createDocument<InstructionDoc>(DB_ID, INSTR_COLLECTION_ID, "unique()", {
        restaurantId: rid,
        userId: me.$id,
        note: trimmed,
        status: "new",
        cartSnapshot: snapshot,
      } as any);

      Alert.alert("Sent", "Your instructions have been sent to the restaurant.");
      setNote("");
    } catch (e: any) {
      console.warn("[Cart] send note failed", e?.message || e);
      Alert.alert("Failed", e?.message || "Could not send instructions. Try again.");
    } finally {
      setNoteSending(false);
    }
  }, [note, rid, restLines]);

  /* ---------- Checkout (with popup summary) ---------- */

  // shows the old summary popup and navigates on confirm
  const showSummaryPopup = useCallback(() => {
    Alert.alert(
      "Checkout",
      `Items: ${availableLines.length}\n` +
        `Subtotal: ₹${subTotal.toFixed(0)}\n` +
        `Platform fee: ₹${platformFee.toFixed(0)}\n` +
        `Delivery: ${deliveryFee === 0 ? "FREE" : `₹${deliveryFee.toFixed(0)}`}\n` +
        `GST (5%): ₹${gst.toFixed(0)}\n` +
        `Total: ₹${total.toFixed(0)}\n\n` +
        `Promo: ${validCoupon?.code || "-"}\n` +
        `Notes: ${note || "-"}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Proceed",
          onPress: () =>
            router.push({
              pathname: "/checkout/[restaurantId]",
              params: {
                restaurantId: rid,
                subTotal: String(subTotal),
                platformFee: String(platformFee),
                deliveryFee: String(deliveryFee),
                gst: String(gst),
                total: String(total),
                // extras
                promoCode: validCoupon?.code || "",
                promoDiscount: String(promoDiscount || 0),
              },
            }),
        },
      ]
    );
  }, [
    availableLines.length,
    subTotal,
    platformFee,
    deliveryFee,
    gst,
    total,
    validCoupon?.code,
    note,
    promoDiscount,
    rid,
    router,
  ]);

  const onCheckout = useCallback(async () => {
    // re-check availability first
    await checkAvailability();

    const hasAnyAvailable = availableLines.length > 0;

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
              goAddMore();
            },
          },
        ]
      );
      return;
    }

    if (unavailableLines.length > 0) {
      const names = unavailableLines.map((l) => `• ${l.item.name}`).join("\n");
      Alert.alert(
        "Some items are unavailable",
        `${names}\n\nRemove these and review the price summary?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove & Review",
            style: "destructive",
            onPress: () => {
              unavailableLines.forEach((l) => removeItem(rid, l.item.id));
              // allow state to settle before reading totals
              setTimeout(showSummaryPopup, 0);
            },
          },
        ]
      );
      return;
    }

    // all good — show the price summary popup
    showSummaryPopup();
  }, [availableLines.length, unavailableLines, removeItem, rid, restLines, showSummaryPopup, checkAvailability]);

  /* ---------- Render ---------- */
  const renderItem = ({ item }: { item: CartLine }) => {
    const isUnavailable = availability[item.item.id] === false;

    return (
      <View style={[styles.card, isUnavailable ? { opacity: 0.6 } : null]}>
        {!!item.item.photoId ? (
          <Image source={{ uri: item.item.photoId }} style={styles.img} />
        ) : (
          <View style={[styles.img, styles.imgPlaceholder]} />
        )}

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.item.name}
            </Text>
            {isUnavailable && (
              <View style={styles.unavailPill}>
                <Text style={styles.unavailPillText}>Unavailable</Text>
              </View>
            )}
          </View>

          <View style={styles.metaRow}>
            <View style={styles.pricePill}>
              <Text style={styles.pricePillText}>₹ {Number(item.item.price).toFixed(0)}</Text>
            </View>

            <View style={{ flex: 1 }} />

            <View style={[styles.stepper, isUnavailable ? { opacity: 0.5 } : null]}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={!isUnavailable ? () => dec(item) : undefined}
                disabled={isUnavailable}
              >
                <Text style={styles.stepBtnText}>–</Text>
              </TouchableOpacity>
              <Text style={styles.stepQty}>{item.qty}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={!isUnavailable ? () => inc(item) : undefined}
                disabled={isUnavailable}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.rowActions}>
            <TouchableOpacity onPress={() => removeItem(rid, item.item.id)} style={styles.removeBtn}>
              <Ionicons name="trash-outline" size={16} color={DANGER} />
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const appliedDaysLeft = daysLeft(validCoupon?.activeUntil || undefined);

  const hasAnyAvailable = availableLines.length > 0;
  const checkoutDisabled = !hasAnyAvailable || restLines.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", paddingTop: Math.max(insets.top * 0.3, 0) }}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={22} />
        </TouchableOpacity>
        <Text style={styles.heading} numberOfLines={1}>
          {restaurantName}
        </Text>
        <TouchableOpacity style={styles.iconBtn} onPress={goAddMore}>
          <Ionicons name="add-circle-outline" size={22} />
        </TouchableOpacity>
      </View>

      {/* Free Delivery Progress Banner (based on AVAILABLE subtotal) */}
      <View style={styles.banner}>
        {subTotal >= freeDeliveryThreshold ? (
          <Text style={styles.bannerText}>
            🎉 You’ve unlocked <Text style={styles.bannerStrong}>Free Delivery</Text>!
          </Text>
        ) : (
          <Text style={styles.bannerText}>
            Add <Text style={styles.bannerStrong}>₹{progressToFree.toFixed(0)}</Text> more to get{" "}
            <Text style={styles.bannerStrong}>Free Delivery</Text>
          </Text>
        )}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${freePct * 100}%` }]} />
        </View>
      </View>

      {/* Unavailable banner + one-tap clean up */}
      {unavailableLines.length > 0 && (
        <View style={styles.unavailableBanner}>
          <Ionicons name="warning-outline" size={16} color={DANGER} />
          <Text style={styles.unavailableText}>
            {unavailableLines.length} item{unavailableLines.length > 1 ? "s" : ""} unavailable. Remove to continue.
          </Text>
          <TouchableOpacity
            onPress={() => {
              unavailableLines.forEach((l) => removeItem(rid, l.item.id));
            }}
            style={styles.fixBtn}
          >
            <Text style={styles.fixBtnText}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      {restLines.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 16, fontWeight: "700" }}>Your cart is empty</Text>
          <Text style={{ color: MUTED, marginTop: 4 }}>Add items to get started</Text>
          <TouchableOpacity style={styles.addMoreBtn} onPress={goAddMore}>
            <Text style={styles.addMoreText}>Browse Menu</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={restLines}
          keyExtractor={(line) => String(line.item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 220 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={{ marginBottom: 8 }}>
              {/* Promo Box */}
              <View style={styles.promoBox}>
                <Ionicons name="pricetags-outline" size={18} color={ACCENT} />
                <TextInput
                  placeholder="Enter promo code"
                  placeholderTextColor={MUTED}
                  value={promo}
                  onChangeText={setPromo}
                  autoCapitalize="characters"
                  style={styles.promoInput}
                />
                <TouchableOpacity onPress={applyPromo} style={styles.promoBtn}>
                  <Text style={styles.promoBtnText}>{appliedCoupon ? "Change" : "Apply"}</Text>
                </TouchableOpacity>
              </View>

              {/* Live coupon suggestions */}
              {liveCoupons.length > 0 && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.offerHeading}>Available offers</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
                    {liveCoupons.map((c) => {
                      const dl = daysLeft(c.activeUntil);
                      const expText = c.activeUntil ? (dl && dl > 0 ? `${dl}d left` : "ends today") : "ongoing";
                      const tag =
                        c.type === "percentage" ? `${c.value}% off` : c.type === "fixed" ? `₹${c.value} off` : "Free delivery";
                      return (
                        <TouchableOpacity key={c.$id} onPress={() => tapCoupon(c)} style={styles.offerCard} activeOpacity={0.9}>
                          <Text style={styles.offerCode}>{c.code}</Text>
                          {!!c.title && <Text style={styles.offerTitle} numberOfLines={1}>{c.title}</Text>}
                          <View style={styles.offerMetaRow}>
                            <Text style={styles.offerTag}>{tag}</Text>
                            <Text style={styles.offerDot}>•</Text>
                            <Text style={styles.offerMeta}>{`Min ₹${c.minSubtotal || 0}`}</Text>
                          </View>
                          <Text style={[styles.offerExpiry, dl && dl <= 2 ? { color: "#B91C1C" } : null]}>
                            {expText}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Order Note */}
              <View style={styles.noteBox}>
                <Ionicons name="create-outline" size={18} color={PRIMARY} />
                <TextInput
                  placeholder="Any special instructions? (e.g., less spicy)"
                  placeholderTextColor={MUTED}
                  value={note}
                  onChangeText={setNote}
                  style={styles.noteInput}
                />
                <TouchableOpacity disabled={noteSending} onPress={sendNote} style={[styles.promoBtn, { backgroundColor: PRIMARY }]}>
                  <Text style={styles.promoBtnText}>{noteSending ? "Sending…" : "Send"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
        />
      )}

      {/* Clear All */}
      {restLines.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={() => clearRestaurant(rid)}>
          <Text style={styles.clearText}>Clear Cart</Text>
        </TouchableOpacity>
      )}

      {/* Sticky Bill + Checkout */}
      {restLines.length > 0 && (
        <View style={[styles.checkoutBar, { paddingBottom: Math.max(insets.bottom + 10, 16) }]}>
          <View style={styles.billBox}>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Subtotal</Text>
              <Text style={styles.billValue}>₹ {subTotal.toFixed(0)}</Text>
            </View>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Platform fee</Text>
              <Text style={styles.billValue}>₹ {platformFee.toFixed(0)}</Text>
            </View>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Delivery</Text>
              <Text style={styles.billValue}>{deliveryFee === 0 ? "FREE" : `₹ ${deliveryFee.toFixed(0)}`}</Text>
            </View>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>GST (5%)</Text>
              <Text style={styles.billValue}>₹ {gst.toFixed(0)}</Text>
            </View>
            {promoDiscount > 0 && (
              <>
                <View style={styles.billRow}>
                  <Text style={[styles.billLabel, { color: ACCENT }]}>
                    Promo ({validCoupon?.code})
                  </Text>
                  <Text style={[styles.billValue, { color: ACCENT }]}>
                    – ₹ {promoDiscount.toFixed(0)}
                  </Text>
                </View>
                {validCoupon?.activeUntil && (
                  <Text style={styles.promoExpiry}>
                    Valid till {fmtDate(validCoupon.activeUntil)}
                  </Text>
                )}
              </>
            )}
            <View style={styles.billDivider} />
            <View style={styles.billRow}>
              <Text style={styles.billTotal}>Total</Text>
              <Text style={styles.billTotal}>₹ {total.toFixed(0)}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.checkoutBtn, { backgroundColor: checkoutDisabled ? "#9CA3AF" : PRIMARY }]}
            onPress={!checkoutDisabled ? onCheckout : undefined}
            activeOpacity={0.9}
            disabled={checkoutDisabled}
          >
            <View style={styles.checkoutBadge}>
              <Ionicons name="time-outline" size={14} color="#fff" />
              <Text style={styles.checkoutBadgeText}>~ 30 min</Text>
            </View>
            <Text style={styles.checkoutText}>
              {checkoutDisabled ? "Unavailable" : `Proceed to Pay • ₹ ${total.toFixed(0)}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

/* ---------- Styles ---------- */
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

  banner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FFEDD5",
  },
  bannerText: { fontSize: 13, color: "#7C2D12" },
  bannerStrong: { fontWeight: "800", color: "#7C2D12" },
  progressTrack: { height: 6, backgroundColor: "#FED7AA", borderRadius: 999, marginTop: 8, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: ACCENT },

  unavailableBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  unavailableText: { color: "#991B1B", fontWeight: "800", flex: 1 },
  fixBtn: { backgroundColor: DANGER, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  fixBtnText: { color: "#fff", fontWeight: "900" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  addMoreBtn: { marginTop: 12, backgroundColor: PRIMARY, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  addMoreText: { color: "#fff", fontWeight: "800" },

  card: { flexDirection: "row", backgroundColor: CARD_BG, borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  img: { width: 72, height: 72, borderRadius: 10, marginRight: 12, backgroundColor: "#eee" },
  imgPlaceholder: { alignItems: "center", justifyContent: "center" },

  itemName: { flex: 1, fontSize: 16, fontWeight: "800" },

  unavailPill: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
    alignSelf: "flex-start",
  },
  unavailPillText: { fontSize: 10, fontWeight: "900", color: "#991B1B" },

  metaRow: { marginTop: 8, flexDirection: "row", alignItems: "center" },

  pricePill: { backgroundColor: PRIMARY, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  pricePillText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: PRIMARY, alignItems: "center", justifyContent: "center" },
  stepBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  stepQty: { width: 26, textAlign: "center", fontWeight: "800" },

  rowActions: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  removeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  removeText: { color: DANGER, fontWeight: "800" },

  promoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  promoInput: { flex: 1, paddingVertical: Platform.select({ ios: 8, android: 6 }), fontWeight: "600" },
  promoBtn: { backgroundColor: ACCENT, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  promoBtnText: { color: "#fff", fontWeight: "800" },

  /* Coupons strip */
  offerHeading: { fontSize: 13, fontWeight: "800", marginLeft: 4, marginBottom: 6, color: PRIMARY },
  offerCard: {
    marginRight: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BORDER,
    minWidth: 180,
  },
  offerCode: { fontSize: 13, fontWeight: "900", color: PRIMARY },
  offerTitle: { marginTop: 2, fontSize: 12, fontWeight: "700", color: "#1F2937" },
  offerMetaRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  offerTag: { fontSize: 12, fontWeight: "800", color: ACCENT },
  offerDot: { color: MUTED },
  offerMeta: { fontSize: 12, color: MUTED, fontWeight: "700" },
  offerExpiry: { marginTop: 6, fontSize: 11, color: MUTED, fontWeight: "700" },

  noteBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  noteInput: { flex: 1, paddingVertical: Platform.select({ ios: 8, android: 6 }), fontWeight: "600" },

  clearBtn: { position: "absolute", right: 16, bottom: 220, backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  clearText: { fontWeight: "800" },

  checkoutBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: "#fff", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, gap: 10 },
  billBox: { backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BORDER },
  billRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 2 },
  billLabel: { color: MUTED, fontWeight: "700" },
  billValue: { fontWeight: "800" },
  billDivider: { height: 1, backgroundColor: BORDER, marginVertical: 6 },
  billTotal: { fontSize: 16, fontWeight: "900" },
  promoExpiry: { marginTop: 4, fontSize: 11, color: MUTED, fontWeight: "700" },

  checkoutBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  checkoutText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  checkoutBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: BADGE, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  checkoutBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
