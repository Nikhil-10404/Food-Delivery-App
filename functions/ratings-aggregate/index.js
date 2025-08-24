import { Client, Databases } from "node-appwrite";

/**
 * HTTP function
 * Request: GET /?itemId=abc123
 * Response: { avg: number, count: number }
 */
export default async ({ req, res, log, error }) => {
  try {
    // Basic method check
    if (req.method !== "GET") {
      return res.json({ error: "Method not allowed" }, 405);
    }

    const itemId = req.query?.itemId;
    if (!itemId || typeof itemId !== "string") {
      return res.json({ error: "Missing itemId" }, 400);
    }

    // Init Appwrite SDK using the function's injected env
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY); // create API key with DB read access

    const databases = new Databases(client);

    const DB_ID = process.env.DB_ID;
    const RATINGS = process.env.RATINGS_COLLECTION_ID;

    if (!DB_ID || !RATINGS) {
      return res.json({ error: "Missing env: DB_ID or RATINGS_COLLECTION_ID" }, 500);
    }

    // Paginate through ratings for this item
    let sum = 0;
    let count = 0;
    let cursor = undefined;

    while (true) {
      const queries = [
        `equal("itemId", ["${itemId}"])`,
        "limit(100)",
      ];
      if (cursor) queries.push(`cursorAfter("${cursor}")`);

      const page = await databases.listDocuments(DB_ID, RATINGS, queries);

      for (const doc of page.documents) {
        const v = Number(doc.value);
        if (!Number.isNaN(v)) {
          sum += v;
          count += 1;
        }
      }

      if (!page.documents.length || page.documents.length < 100) break;
      cursor = page.documents[page.documents.length - 1].$id;
    }

    const avg = count ? sum / count : 0;

    // Cache hints (optional)
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=15"); // 15s client cache
    return res.json({ avg, count });
  } catch (e) {
    error(e?.message || String(e));
    return res.json({ error: "Internal error" }, 500);
  }
};
