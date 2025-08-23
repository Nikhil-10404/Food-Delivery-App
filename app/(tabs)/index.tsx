import { SafeAreaView } from "react-native-safe-area-context";
import "../globals.css";
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { ActivityIndicator, Animated } from "react-native";
import { useRouter } from "expo-router";
import useAuthStore from "@/store/auth.store";
import { databases, appwriteConfig } from "@/lib/appwrite";
import { Query } from "react-native-appwrite";

import HomeHeaderLight from "@/components/home/HomeHeaderLight";
import RestaurantCardLight from "@/components/home/RestaurantCardLight";
import TabsBarLight from "@/components/home/TabsBarLight";

const DB_ID = appwriteConfig.databaseId;
const COLLECTION_RESTAURANTS = appwriteConfig.Restaurant_Collection_ID;

// browsing page size
const PAGE_SIZE = 24;
// fetch batch size when pulling "all" for search
const SEARCH_BATCH = 100;
// hard cap (safety) for max items we’ll fetch during a search
const SEARCH_MAX = 600;

const MOOD_LINES = [
  "Find your favorite food 🍔",
  "Hungry? Let’s fix that 🤤",
  "Something quick or a full feast?",
  "Snack now, study later.",
  "What’s your mood today?",
];

type Restaurant = {
  $id: string;
  name: string;
  imageUrl?: string;
  rating?: number;
  address?: string;
  categories?: string[];
  deliveryTimeMins?: number;
  description?: string;
};

function timeOfDayGreeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const shapeDocs = (docs: any[]): Restaurant[] =>
  docs
    .map((d) => ({
      $id: String(d.$id),
      name: typeof d.name === "string" ? d.name : String(d.name ?? ""),
      imageUrl: typeof d.imageUrl === "string" ? d.imageUrl : undefined,
      rating: typeof d.rating === "number" ? d.rating : undefined,
      address: typeof d.address === "string" ? d.address : undefined,
      categories: Array.isArray(d.categories) ? d.categories.map((x: any) => String(x)) : undefined,
      deliveryTimeMins: typeof d.deliveryTimeMins === "number" ? d.deliveryTimeMins : undefined,
      description: typeof d.description === "string" ? d.description : undefined,
    }))
    .filter((r) => r.name.length > 0);

const buildQueries = (limit: number, cursor?: string | null) => {
  const q: any[] = [Query.orderAsc("name"), Query.limit(limit)];
  if (cursor) q.push(Query.cursorAfter(cursor));
  return q;
};

export default function HomeIndex() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [search, setSearch] = useState("");
  const [mood, setMood] = useState(MOOD_LINES[0]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // prevent duplicate loads on fast scroll
  const loadingMoreRef = useRef(false);
  // track first load so we don’t auto-refetch on mount when search is empty
  const initialLoadedRef = useRef(false);

  const username =
    (user?.name && user.name.trim()) ||
    (user?.email && user.email.split("@")[0]) ||
    "Foodie";
  const greeting = `${timeOfDayGreeting()}, ${username}`;

  useEffect(() => {
    setMood(MOOD_LINES[Math.floor(Math.random() * MOOD_LINES.length)]);
  }, []);

  /** Normal browse: first page */
 const loadInitial = useCallback(async () => {
  setLoading(true);
  setIsSearching(false);
  try {
    const res = await databases.listDocuments(
      DB_ID,
      COLLECTION_RESTAURANTS,
      [Query.orderAsc("name"), Query.limit(PAGE_SIZE)]
    );
    const items = shapeDocs(res.documents ?? []);
    setRestaurants(items);
    setNextCursor(items.length === PAGE_SIZE ? items[items.length - 1].$id : null);
  } catch (err: any) {
    console.error("loadInitial failed (ordered):", err?.message || err);
    // fallback: try again without orderAsc (works even if index missing)
    try {
      const res2 = await databases.listDocuments(
        DB_ID,
        COLLECTION_RESTAURANTS,
        [Query.limit(PAGE_SIZE)]
      );
      const items2 = shapeDocs(res2.documents ?? []);
      setRestaurants(items2);
      setNextCursor(items2.length === PAGE_SIZE ? items2[items2.length - 1].$id : null);
    } catch (err2: any) {
      console.error("loadInitial fallback failed:", err2?.message || err2);
      setRestaurants([]);
      setNextCursor(null);
    }
  } finally {
    setLoading(false);
    initialLoadedRef.current = true;
  }
}, []);

const loadMore = useCallback(async () => {
  if (isSearching) return;
  if (!nextCursor || loadingMoreRef.current || isLoadingMore) return;

  loadingMoreRef.current = true;
  setIsLoadingMore(true);
  try {
    const res = await databases.listDocuments(
      DB_ID,
      COLLECTION_RESTAURANTS,
      [Query.orderAsc("name"), Query.limit(PAGE_SIZE), Query.cursorAfter(nextCursor)]
    );
    const items = shapeDocs(res.documents ?? []);
    setRestaurants((prev) => [...prev, ...items]);
    setNextCursor(items.length === PAGE_SIZE ? items[items.length - 1].$id : null);
  } catch (err: any) {
    console.error("loadMore failed (ordered):", err?.message || err);
    // fallback without ordering
    try {
      const res2 = await databases.listDocuments(
        DB_ID,
        COLLECTION_RESTAURANTS,
        [Query.limit(PAGE_SIZE), Query.cursorAfter(nextCursor)]
      );
      const items2 = shapeDocs(res2.documents ?? []);
      setRestaurants((prev) => [...prev, ...items2]);
      setNextCursor(items2.length === PAGE_SIZE ? items2[items2.length - 1].$id : null);
    } catch (err2: any) {
      console.error("loadMore fallback failed:", err2?.message || err2);
    }
  } finally {
    setIsLoadingMore(false);
    loadingMoreRef.current = false;
  }
}, [nextCursor, isLoadingMore, isSearching]);


  /** Fetch ALL (batched) then filter locally — reliable search */
  const runSearch = useCallback(
    async (termRaw: string) => {
      const term = termRaw.trim();
      if (!term) {
        // If user submits empty, just restore full list
        await loadInitial();
        return;
      }
      setLoading(true);
      setIsSearching(true);
      try {
        let all: Restaurant[] = [];
        let cursor: string | null = null;

        while (all.length < SEARCH_MAX) {
          const res = await databases.listDocuments(DB_ID, COLLECTION_RESTAURANTS, buildQueries(SEARCH_BATCH, cursor));
          const batch = shapeDocs(res.documents ?? []);
          all = all.concat(batch);
          if (batch.length < SEARCH_BATCH) break;
          cursor = batch[batch.length - 1].$id;
        }

        const needle = term.toLowerCase();
        const filtered = all.filter((r) => {
          const hay = `${r.name} ${r.address ?? ""} ${(r.categories ?? []).join(" ")} ${r.description ?? ""}`.toLowerCase();
          return hay.includes(needle);
        });

        setRestaurants(filtered);
        setNextCursor(null); // disable infinite scroll while searching
      } catch {
        setRestaurants([]);
        setNextCursor(null);
      } finally {
        setLoading(false);
      }
    },
    [loadInitial]
  );

  // initial page
  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ✅ Auto-restore full list when the search field is cleared (no button press)
  useEffect(() => {
    const cleared = search.trim().length === 0;
    if (!cleared) return;
    if (!initialLoadedRef.current) return; // avoid second fetch on mount
    setIsSearching(false);
    setNextCursor(null);
    loadInitial();
  }, [search, loadInitial]);

  const onSubmitSearch = () => {
    // only trigger when user presses Search/Return
    runSearch(search);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (isSearching) {
      await runSearch(search);
    } else {
      await loadInitial();
    }
    setRefreshing(false);
  };

  const header = useMemo(
    () => (
      <HomeHeaderLight
        greeting={greeting}
        mood={mood}
        search={search}
        onChangeSearch={setSearch}
        onSubmitSearch={onSubmitSearch}
      />
    ),
    [greeting, mood, search]
  );

  const footer = useMemo(
    () => (isLoadingMore ? <ActivityIndicator style={{ paddingVertical: 16 }} /> : null),
    [isLoadingMore]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }}>
      {loading && restaurants.length === 0 ? (
        <Animated.View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </Animated.View>
      ) : (
        <>
          <Animated.FlatList
            data={restaurants}
            keyExtractor={(i) => i.$id}
            renderItem={({ item }) => (
              <RestaurantCardLight
                item={item}
                onPress={() => (router as any).push({
                    pathname: "/restaurants/[id]",   // runtime URL (group name isn’t part of the URL)
                    params: { id: String(item.$id) },
})}
              />
            )}
            ListHeaderComponent={header}
            ListFooterComponent={footer}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={{ paddingBottom: 88 }}
            keyboardShouldPersistTaps="handled"
          />
          <TabsBarLight />
        </>
      )}
    </SafeAreaView>
  );
}
