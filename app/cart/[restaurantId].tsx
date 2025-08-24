// app/cart/[restaurantId].tsx
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCart } from "@/store/cart";

export default function RestaurantCartScreen() {
  const router = useRouter();
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const { cartFor, inc, dec, removeItem, clearRestaurantCart, totalForRestaurant } = useCart();

  const cart = cartFor(String(restaurantId));
  const items = useMemo(() => Object.values(cart?.items ?? {}), [cart]);
  const total = totalForRestaurant(String(restaurantId));

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>{cart?.restaurantName || "Cart"}</Text>
        <View style={{ width: 64 }} />
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text>Your cart is empty.</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <View style={styles.row}>
                {!!item.photoId && <Image source={{ uri: item.photoId }} style={styles.img} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.price}>₹ {item.price}</Text>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => dec(String(restaurantId), item.id)}><Text style={styles.qtyBtnText}>–</Text></TouchableOpacity>
                    <Text style={styles.qty}>{item.qty}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => inc(String(restaurantId), item.id)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={() => removeItem(String(restaurantId), item.id)}>
                      <Text style={{ color: "#EF4444", fontWeight: "700" }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          />

          <View style={styles.checkoutBar}>
            <View>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹ {total.toFixed(0)}</Text>
            </View>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => Alert.alert("Checkout", "Hook this up to your order flow next.")}
            >
              <Text style={styles.checkoutText}>Proceed to Checkout</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {items.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={() => clearRestaurantCart(String(restaurantId))}>
          <Text style={styles.clearText}>Clear Cart</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  backBtn: { padding: 8 },
  backText: { fontSize: 16, fontWeight: "700" },
  heading: { fontSize: 16, fontWeight: "800" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center" },

  row: { flexDirection: "row", backgroundColor: "#F9FAFB", borderRadius: 12, padding: 12 },
  img: { width: 64, height: 64, borderRadius: 10, marginRight: 12, backgroundColor: "#eee" },
  name: { fontSize: 15, fontWeight: "700" },
  price: { marginTop: 4, fontSize: 14 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  qtyBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  qty: { width: 24, textAlign: "center", fontWeight: "700" },

  checkoutBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB", backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 16 },
  totalLabel: { fontSize: 12, color: "#6B7280" },
  totalValue: { fontSize: 18, fontWeight: "800" },
  checkoutBtn: { flex: 1, backgroundColor: "#111827", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  checkoutText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  clearBtn: { position: "absolute", right: 16, bottom: 78, backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  clearText: { fontWeight: "700" },
});
