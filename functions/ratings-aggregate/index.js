import { Client, Databases, Query } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    if (req.method !== "GET") {
      return res.json({ error: "Method not allowed" }, 405);
    }

    const itemId = req.query?.itemId;
    if (!itemId || typeof itemId !== "string") {
      return res.json({ error: "Missing itemId" }, 400);
    }

    // Function variables (as in your screenshot)
    const endpoint  = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
    const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID; // <-- auto-injected by Appwrite
    const apiKey    = process.env.EXPO_PUBLIC_APPWRITE_API_KEY;
    const DB_ID     = process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID;
    const RATINGS   = process.env.EXPO_PUBLIC_APPWRITE_RATINGS_ID;

    if (!endpoint || !projectId || !apiKey || !DB_ID || !RATINGS) {
      return res.json(
        { error: "Missing env vars (endpoint/projectId/apiKey/DB_ID/RATINGS)" },
        500
      );
    }

    const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const databases = new Databases(client);

    let sum = 0, count = 0, cursor;
    while (true) {
      const queries = [Query.equal("itemId", itemId), Query.limit(100)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const page = await databases.listDocuments(DB_ID, RATINGS, queries);
      for (const d of page.documents) {
        const v = Number(d.value);
        if (!Number.isNaN(v)) { sum += v; count += 1; }
      }
      if (page.documents.length < 100) break;
      cursor = page.documents[page.documents.length - 1].$id;
    }

    return res.json({ avg: count ? sum / count : 0, count });
  } catch (e) {
    const msg = (e && (e.message || e.toString())) || "Internal error";
    error(msg);
    return res.json({ error: msg }, 500);
  }
};
