import React from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ---------- Types ---------- */
export type CartItem = {
  id: string;
  name: string;
  price: number;
  photoId?: string;
};

export type CartLine = {
  restaurantId: string;
  restaurantName: string;
  item: CartItem;
  qty: number;
};

export type CartState = {
  lines: CartLine[];

  // actions
  addItem: (args: {
    restaurantId: string;
    restaurantName: string;
    item: CartItem;
    qty?: number;
  }) => void;

  updateQty: (restaurantId: string, itemId: string, qty: number) => void;
  removeItem: (restaurantId: string, itemId: string) => void;
  clearRestaurant: (restaurantId: string) => void;

  // selectors/helpers
  getItemQty: (restaurantId: string, itemId: string) => number;
  getRestaurantCount: (restaurantId: string) => number;
};

/* ---------- Store ---------- */
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],

      addItem: ({ restaurantId, restaurantName, item, qty = 1 }) => {
        set((state) => {
          const idx = state.lines.findIndex(
            (l) => l.restaurantId === restaurantId && l.item.id === item.id
          );
          if (idx >= 0) {
            // bump qty
            const next = [...state.lines];
            next[idx] = { ...next[idx], qty: next[idx].qty + qty };
            return { lines: next };
          }
          return {
            lines: [
              ...state.lines,
              { restaurantId, restaurantName, item, qty: Math.max(1, qty) },
            ],
          };
        });
      },

      updateQty: (restaurantId, itemId, qty) =>
        set((state) => {
          const next = state.lines.map((l) =>
            l.restaurantId === restaurantId && l.item.id === itemId
              ? { ...l, qty: Math.max(1, qty) }
              : l
          );
          return { lines: next };
        }),

      removeItem: (restaurantId, itemId) =>
        set((state) => ({
          lines: state.lines.filter(
            (l) => !(l.restaurantId === restaurantId && l.item.id === itemId)
          ),
        })),

      clearRestaurant: (restaurantId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.restaurantId !== restaurantId),
        })),

      getItemQty: (restaurantId, itemId) =>
        get().lines.find(
          (l) => l.restaurantId === restaurantId && l.item.id === itemId
        )?.qty || 0,

      getRestaurantCount: (restaurantId) =>
        get().lines
          .filter((l) => l.restaurantId === restaurantId)
          .reduce((n, l) => n + l.qty, 0),
    }),
    {
      name: "foodie-cart",
      storage: createJSONStorage(() => AsyncStorage),
      // Version if you ever need migrations later
      version: 1,
      // Only persist the data you really need
      partialize: (state) => ({ lines: state.lines }),
    }
  )
);
