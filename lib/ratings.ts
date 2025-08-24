// lib/ratings.ts
import { databases, appwriteConfig, getCurrentUser } from "@/lib/appwrite";
import { Permission, Role } from "react-native-appwrite";

const DB_ID = appwriteConfig.databaseId;
const RATINGS = appwriteConfig.ratingsCollectionId;

export async function createOrUpdateRating(itemId: string, value: number) {
  const me = await getCurrentUser();
  if (!me) throw new Error("Sign in to rate.");
  const userId = me.$id;

  // check if already exists
  const existing = await databases.listDocuments(DB_ID, RATINGS, [
    `equal("itemId", ["${itemId}"])`,
    `equal("userId", ["${userId}"])`,
    "limit(1)",
  ]);

  if (existing.documents.length) {
    await databases.updateDocument(DB_ID, RATINGS, existing.documents[0].$id, { value });
    return;
  }

  await databases.createDocument(
    DB_ID,
    RATINGS,
    "unique()",
    { itemId, userId, value },
    [
      Permission.read(Role.users()),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ]
  );
}
