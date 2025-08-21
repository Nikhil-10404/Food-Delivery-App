// lib/env.ts
import Constants from "expo-constants";
export const BACKEND_URL =
  (Constants.expoConfig?.extra as any)?.BACKEND_URL ??
  (Constants.manifest2 as any)?.extra?.BACKEND_URL;

if (!BACKEND_URL) {
  // This will print in Metro/Device logs so you can see it’s missing immediately
  console.warn("[ENV] BACKEND_URL is NOT set");
}
