import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { databases, appwriteConfig } from "@/lib/appwrite";
import useAuthStore from "@/store/auth.store";

const STORAGE_KEY = "selectedLocation.v1";
const DB_ID = appwriteConfig.databaseId;
// ⚠️ ensure this exists in appwriteConfig
const COLLECTION_USERS = appwriteConfig.userCollectionId;

export type StoredLocation = {
  label: string; // CITY, STATE, COUNTRY
  lat: number;
  lng: number;
};

export function usePersistedLocation() {
  const { user } = useAuthStore();
  const [loc, setLoc] = useState<StoredLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setLoc(JSON.parse(raw));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveLocal = useCallback(async (value: StoredLocation) => {
    setLoc(value);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }, []);

  const saveRemote = useCallback(async (value: StoredLocation) => {
    try {
      if (!user?.$id) return;
      await databases.updateDocument(DB_ID, COLLECTION_USERS, String(user.$id), {
        address: value.label,
      });
    } catch (e: any) {
      console.warn("Failed to update user address in DB:", e?.message || e);
    }
  }, [user?.$id]);

  const setBoth = useCallback(async (value: StoredLocation) => {
    await saveLocal(value);
    await saveRemote(value);
  }, [saveLocal, saveRemote]);

  return { loc, setLoc: setBoth, loading };
}
