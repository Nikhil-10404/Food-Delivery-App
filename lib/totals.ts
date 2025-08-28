// lib/totals.ts
import { CartLine } from '@/store/cart';

export type Totals = {
  subTotal: number;
  platformFee: number;
  deliveryFee: number;
  gst: number;
  total: number;
};

export function calculateTotals(lines: CartLine[]): Totals {
  const subTotal = lines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);
  const platformFee = 5;
  const deliveryFee = subTotal >= 399 ? 0 : 29;
  const gst = Math.round((subTotal + platformFee + deliveryFee) * 0.05);
  const total = Math.max(0, subTotal + platformFee + deliveryFee + gst);
  return { subTotal, platformFee, deliveryFee, gst, total };
}
