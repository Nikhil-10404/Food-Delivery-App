// lib/api.ts
import { BACKEND_URL } from "./env";

function tryParseJson(raw: string) {
  try { return JSON.parse(raw); } catch { return null; }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BACKEND_URL) throw new Error("BACKEND_URL is not configured");

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  const raw = await res.text();
  const asJson = raw ? tryParseJson(raw) : null;

  if (!res.ok) {
    const msg =
      (asJson && (asJson.error || asJson.message)) ||
      (raw?.trim() ? raw : `HTTP ${res.status}`);
    // Force message to be a plain string
    throw new Error(String(msg));
  }

  return (asJson ?? ({} as any)) as T;
}

export type StartOtpResp = {
  ok: boolean;
  expiresInMs: number;
  ttlMs: number;
  resendCooldownMs: number;
  maxResends: number;
};

export function startOtp(userId: string) {
  return api<StartOtpResp>("/auth/otp/start", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function verifyOtp(input: { userId: string; otp: string; newPassword: string }) {
  return api<{ ok: boolean }>("/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEmailAdmin(input: { userId: string; newEmail: string; userDocId?: string }) {
  return api<{ ok: boolean; warning?: string; detail?: string }>("/auth/account/update-email", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
