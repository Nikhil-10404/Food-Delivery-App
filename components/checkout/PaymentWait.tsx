// components/checkout/PaymentWait.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { fetchPaymentStatus } from '@/lib/payments';

export default function PaymentWait({
  referenceId,
  onPaid,
  onFailed,
  onPending, // new
  timeoutMs = 30000,
  pollIntervalMs = 2000,
}: {
  referenceId: string;
  onPaid: () => void;
  onFailed: (status: string) => void;
  onPending?: () => void;          // when user closes/timeout
  timeoutMs?: number;
  pollIntervalMs?: number;
}) {
  const [tries, setTries] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<any>(null);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    const tick = async () => {
      try {
        const s = await fetchPaymentStatus(referenceId);
        if (s.status === 'paid') return onPaid();
        if (s.status === 'failed' || s.status === 'canceled' || s.status === 'expired') return onFailed(s.status);
        // pending …
        if (Date.now() - startedAt.current > timeoutMs) {
          onPending?.(); // stop waiting; let user try again
          return;
        }
        timer.current = setTimeout(tick, pollIntervalMs);
        setTries(t => t + 1);
      } catch (e: any) {
        setErr(e?.message || 'Network error');
        timer.current = setTimeout(tick, pollIntervalMs);
      }
    };
    tick();
    return () => timer.current && clearTimeout(timer.current);
  }, [referenceId]);

  return (
    <View style={{ padding: 14, borderWidth: 1, borderColor: '#F59E0B', backgroundColor: '#FFFBEB', borderRadius: 12 }}>
      <Text style={{ fontWeight: '900', color: '#111827' }}>Waiting for Razorpay…</Text>
      <Text style={{ color: '#6B7280', marginTop: 6 }}>We’ll confirm automatically. You can retry or close.</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        <ActivityIndicator />
        <Text style={{ marginLeft: 10, color: '#111827', fontWeight: '800' }}>Checking… ({tries})</Text>
      </View>
      {!!err && <Text style={{ color: '#DC2626', marginTop: 8 }}>{err}</Text>}

      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <TouchableOpacity
          onPress={() => onPending?.()}
          style={{ backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginRight: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '900' }}>Close</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onPending?.()}
          style={{ backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 }}>
          <Text style={{ color: '#111827', fontWeight: '900' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
