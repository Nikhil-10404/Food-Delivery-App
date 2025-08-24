import { Client, Databases, Query } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    if (req.method !== "GET") return res.json({ error: "Method not allowed" }, 405);
    const itemId = req.query?.itemId;
    if (!itemId || typeof itemId !== "string") return res.json({ error: "Missing itemId" }, 400);

    const endpoint  = "https://cloud.appwrite.io/v1"; // <— hardcoded
    const projectId = "689f4acb0019f2d2bc66"; // auto-injected
    const apiKey    = "standard_7de18e47d6d481575ef51b7d22e9434c942b3121769a2f608d03c3a366211f00956c477a69171b4f7856e71e4b617f59d619485bfc8efa76b6be4e526a756750309429de92926a0a9d08e9e1e00633c63e2026e967c51cd1164a71c8f75d48742c7a4ba784203f0f60bfced5f74677045daa0d878609ebdbbaea7d0d8ff6933c";             // you set this
    const DB_ID     = "689f4cf400382bb1fa55";
    const RATINGS   = "68ab0d4d003321696043";

    if (!apiKey || !DB_ID || !RATINGS || !projectId) {
      return res.json({ error: "Missing env vars" }, 500);
    }

    const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const databases = new Databases(client);

    let sum = 0, count = 0, cursor;
    while (true) {
      const queries = [Query.equal("itemId", itemId), Query.limit(100)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const page = await databases.listDocuments(DB_ID, RATINGS, queries);
      for (const d of page.documents) { const v = Number(d.value); if (!Number.isNaN(v)) { sum += v; count++; } }
      if (page.documents.length < 100) break;
      cursor = page.documents[page.documents.length - 1].$id;
    }
    return res.json({ avg: count ? sum / count : 0, count });
  } catch (e) {
    error(e?.message || String(e));
    return res.json({ error: "Internal error" }, 500);
  }
};
