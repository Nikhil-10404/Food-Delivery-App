import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';
import { fetchPaymentStatus, createPaymentLink } from '@/lib/payments';

export async function payPendingUPI({
  referenceId,
  amount,
  customerName,
  onPaid,
  onStillPending,
}: {
  referenceId: string;
  amount: number;
  customerName?: string;
  onPaid: () => void;
  onStillPending?: () => void;
}) {
  try {
    const callbackUrl = Linking.createURL(`/orders/${referenceId}`);

    const link = await createPaymentLink({
      referenceId,
      amount: Number(amount),
      name: customerName,
      callbackUrl,
    });

    if (!link?.short_url) {
      Alert.alert('UPI error', 'Could not create payment link.');
      onStillPending?.();
      return;
    }

    let returnedViaCallback = false;
    try {
      const result = await WebBrowser.openAuthSessionAsync(link.short_url, callbackUrl);
      returnedViaCallback = result?.type === 'success';
    } catch {
      await WebBrowser.openBrowserAsync(link.short_url);
    }

    await new Promise((r) => setTimeout(r, returnedViaCallback ? 600 : 1200));

    const status = await fetchPaymentStatus(referenceId);
    if (status?.status === 'paid') onPaid();
    else onStillPending?.();

  } catch (e: any) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('already_paid')) {
      onPaid();
      return;
    }
    Alert.alert('UPI error', e?.message || 'Please try again.');
    onStillPending?.();
  }
}
