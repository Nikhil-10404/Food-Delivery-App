// lib/payments.ts
export const API_BASE = 'https://payment-services-d0x2.onrender.com';

async function parseJsonOrThrow(res: Response) {
  const text = await res.text();               // read raw
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; }
  catch {                                       // HTML or empty -> throw with preview
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 180)}`);
  }
  if (!res.ok) {
    const msg = data?.detail || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function createPaymentLink(params: {
  referenceId: string;
  amount: number;
  name?: string;
  email?: string;
  contact?: string;
}) {
  const res = await fetch(`${API_BASE}/api/payments/create-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow(res) as Promise<{ id: string; short_url: string; status: string; reference_id: string }>;
}

export async function fetchPaymentStatus(referenceId: string) {
  const res = await fetch(`${API_BASE}/api/payments/status/${referenceId}`);
  return parseJsonOrThrow(res) as Promise<{ referenceId: string; status: 'pending'|'paid'|'failed'|'canceled'|'expired'; rawStatus: string; linkId?: string }>;
}
