import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type CartItem = {
  id: string;           // menuitem doc id
  name: string;
  price: number;
  photoId?: string;
  qty: number;
};

export type RestaurantCart = {
  restaurantId: string;
  restaurantName: string;
  items: Record<string, CartItem>; // keyed by menuitem id
  updatedAt: number;
};

type CartByRestaurant = Record<string, RestaurantCart>; // key = restaurantId

type CartContextValue = {
  carts: CartByRestaurant;
  addItem: (args: {
    restaurantId: string;
    restaurantName: string;
    item: Omit<CartItem, "qty">;
    qty?: number;
  }) => void;
  inc: (restaurantId: string, itemId: string) => void;
  dec: (restaurantId: string, itemId: string) => void;
  removeItem: (restaurantId: string, itemId: string) => void;
  clearRestaurantCart: (restaurantId: string) => void;
  countForRestaurant: (restaurantId: string) => number;
  totalForRestaurant: (restaurantId: string) => number;
  cartFor: (restaurantId: string) => RestaurantCart | undefined;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "FOOD_CARTS_V1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [carts, setCarts] = useState<CartByRestaurant>({});

  // load on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setCarts(JSON.parse(raw));
      } catch {}
    })();
  }, []);
  // persist on change
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(carts)).catch(() => {});
  }, [carts]);

  const addItem: CartContextValue["addItem"] = ({ restaurantId, restaurantName, item, qty = 1 }) => {
    setCarts(prev => {
      const existing = prev[restaurantId] ?? {
        restaurantId, restaurantName, items: {}, updatedAt: Date.now(),
      };
      const prevItem = existing.items[item.id];
      const nextQty = (prevItem?.qty ?? 0) + qty;
      return {
        ...prev,
        [restaurantId]: {
          ...existing,
          restaurantName,
          items: { ...existing.items, [item.id]: { ...item, qty: nextQty } },
          updatedAt: Date.now(),
        },
      };
    });
  };

  const inc = (restaurantId: string, itemId: string) =>
    setCarts(prev => {
      const cart = prev[restaurantId]; if (!cart) return prev;
      const it = cart.items[itemId]; if (!it) return prev;
      return { ...prev, [restaurantId]: { ...cart, items: { ...cart.items, [itemId]: { ...it, qty: it.qty + 1 } }, updatedAt: Date.now() } };
    });

  const dec = (restaurantId: string, itemId: string) =>
    setCarts(prev => {
      const cart = prev[restaurantId]; if (!cart) return prev;
      const it = cart.items[itemId]; if (!it) return prev;
      const nextQty = it.qty - 1;
      const nextItems = { ...cart.items };
      if (nextQty <= 0) delete nextItems[itemId];
      else nextItems[itemId] = { ...it, qty: nextQty };
      return { ...prev, [restaurantId]: { ...cart, items: nextItems, updatedAt: Date.now() } };
    });

  const removeItem = (restaurantId: string, itemId: string) =>
    setCarts(prev => {
      const cart = prev[restaurantId]; if (!cart) return prev;
      const { [itemId]: _, ...rest } = cart.items;
      return { ...prev, [restaurantId]: { ...cart, items: rest, updatedAt: Date.now() } };
    });

  const clearRestaurantCart = (restaurantId: string) =>
    setCarts(prev => {
      const cart = prev[restaurantId]; if (!cart) return prev;
      return { ...prev, [restaurantId]: { ...cart, items: {}, updatedAt: Date.now() } };
    });

  const countForRestaurant = (restaurantId: string) =>
    Object.values(carts[restaurantId]?.items ?? {}).reduce((s, it) => s + it.qty, 0);

  const totalForRestaurant = (restaurantId: string) =>
    Object.values(carts[restaurantId]?.items ?? {}).reduce((s, it) => s + it.qty * it.price, 0);

  const cartFor = (restaurantId: string) => carts[restaurantId];

  const value = useMemo<CartContextValue>(() => ({
    carts, addItem, inc, dec, removeItem, clearRestaurantCart, countForRestaurant, totalForRestaurant, cartFor
  }), [carts]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
};
