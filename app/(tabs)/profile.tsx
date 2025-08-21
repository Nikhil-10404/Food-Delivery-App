import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { View, Text, Image, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { storage, databases, ID, getCurrentUser, appwriteConfig } from "@/lib/appwrite";
import { Permission, Role } from "appwrite";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";

const DEV_LOG = true;

/* ---------- Helpers ---------- */

// Build a plain string /view URL by hand (works on all plans)
const getViewUrlFromFileId = (fileId: string): string => {
  const endpoint = appwriteConfig.endpoint.replace(/\/+$/, ""); // e.g. https://fra.cloud.appwrite.io/v1
  return `${endpoint}/storage/buckets/${appwriteConfig.bucketId}/files/${fileId}/view?project=${appwriteConfig.projectId}`;
};

const withCache = (url: string) =>
  `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;

// Accepts either a fileId or a full URL (legacy). Returns a /view URL string for display.
const normalizeAvatarToViewUrl = (
  value?: string | null
): { url: string | null; fileId?: string } => {
  if (!value) return { url: null }; // ⬅️ no URL → show initials

  if (value.startsWith("http")) {
    const mPrev = value.match(/\/files\/([^/]+)\/preview/);
    if (mPrev?.[1]) {
      const id = mPrev[1];
      return { url: getViewUrlFromFileId(id), fileId: id };
    }
    const mView = value.match(/\/files\/([^/]+)\/view/);
    if (mView?.[1]) return { url: value, fileId: mView[1] };
    return { url: value }; // external URL (keep as-is)
  }

  // Otherwise treat it as a fileId
  return { url: getViewUrlFromFileId(value), fileId: value };
};

/* ---------- Component ---------- */

export default function ProfileScreen() {
  const [profileImage, setProfileImage] = useState<string | null>(null); // string URL or null (for initials)
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [oldAvatarId, setOldAvatarId] = useState<string | null>(null);

  const sheetRef = useRef<BottomSheetModal | null>(null);
  const snapPoints = useMemo(() => ["40%", "70%"], []);

  // Fetch user & compute display URL (or initials)
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userDoc = await getCurrentUser();
        if (!userDoc) return;

        setUser(userDoc);

        const { url, fileId } = normalizeAvatarToViewUrl(userDoc.avatar);
        if (DEV_LOG) console.log("👀 normalized avatar", { stored: userDoc.avatar, fileId, url });

        if (fileId) setOldAvatarId(fileId);
        if (url) {
          setProfileImage(withCache(url));
        } else {
          setProfileImage(null); // ⬅️ initials fallback
        }
      } catch (err) {
        console.error("Error fetching user:", err);
      }
    };
    fetchUser();
  }, []);

  // Upload photo → per-file ACLs → store fileId in DB → show /view URL
  const uploadToAppwrite = async (uri: string) => {
    try {
      setLoading(true);

      const fileName = uri.split("/").pop() || `photo_${Date.now()}.jpg`;
      const res = await fetch(uri);
      const blob = await res.blob();

      const file: any = {
        uri,
        name: fileName,
        type: blob.type || "image/jpeg",
        size: blob.size,
      };

      const uploadedFile = await storage.createFile(
        appwriteConfig.bucketId,
        ID.unique(),
        file,
        [
          Permission.read(Role.any()),             // public GET for RN <Image/>
          Permission.write(Role.any()),   // owner can modify/delete (NOT any)
        ]
      );

      // Save **fileId** in (String) 'avatar'
      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userCollectionId,
        user.$id,
        { avatar: uploadedFile.$id }
      );

      // Delete old image if different
      if (oldAvatarId && oldAvatarId !== uploadedFile.$id) {
        try { await storage.deleteFile(appwriteConfig.bucketId, oldAvatarId); } catch {}
      }
      setOldAvatarId(uploadedFile.$id);

      // Build final display URL (string) + cache bust
      const displayUrl = withCache(getViewUrlFromFileId(uploadedFile.$id));
      if (DEV_LOG) console.log("🖼️ Final display URL:", displayUrl);
      setProfileImage(displayUrl);

      Alert.alert("✅ Success", "Profile photo updated!");
    } catch (err: any) {
      console.error("Upload error:", err);
      Alert.alert("❌ Error", err?.message ?? "Failed to update profile photo.");
    } finally {
      setLoading(false);
      sheetRef.current?.dismiss();
    }
  };

  const removePhoto = async () => {
    try {
      setLoading(true);

      if (oldAvatarId) {
        try { await storage.deleteFile(appwriteConfig.bucketId, oldAvatarId); } catch {}
      }

      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userCollectionId,
        user.$id,
        { avatar: null } // ⬅️ clear it; your schema now allows null or empty string
      );

      setOldAvatarId(null);
      setProfileImage(null); // ⬅️ show initials
      Alert.alert("✅ Removed", "Profile photo reset to initials.");
    } catch (err:any) {
      console.error("Remove error:", err);
      Alert.alert("❌ Error", err?.message ?? "Failed to remove profile photo.");
    } finally {
      setLoading(false);
      sheetRef.current?.dismiss();
    }
  };

  // Pickers
  const pickImageFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) await uploadToAppwrite(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Camera permission is needed.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) await uploadToAppwrite(result.assets[0].uri);
  };

  const openSheet = useCallback(() => sheetRef.current?.present(), []);

  return (
    <View className="flex-1 bg-white px-6 pt-12">
      <Text className="text-2xl font-bold text-gray-900 mb-8">Profile</Text>

      <View className="items-center">
        <View className="relative">
          {loading ? (
            <ActivityIndicator size="large" color="#f97316" />
          ) : profileImage ? (
            <Image
              source={{ uri: profileImage }}
              className="w-32 h-32 rounded-full border-4 border-orange-500"
              onError={() => {
                // If the image ever fails, fallback to initials
                setProfileImage(null);
              }}
            />
          ) : (
            // 🔤 Initials fallback
            <View className="w-32 h-32 rounded-full border-4 border-orange-500 bg-orange-100 items-center justify-center">
              <Text className="text-4xl font-bold text-orange-600">
                {user?.name ? user.name.charAt(0).toUpperCase() : "?"}
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={openSheet}
            className="absolute bottom-2 right-2 bg-orange-500 p-2 rounded-full"
          >
            <Ionicons name="pencil" size={18} color="white" />
          </TouchableOpacity>
        </View>

        <Text className="text-lg font-semibold mt-4">{user?.name}</Text>
        <Text className="text-gray-500">{user?.email}</Text>
      </View>

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#fff" }}
        handleIndicatorStyle={{ backgroundColor: "#ccc" }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
        )}
      >
        <BottomSheetView className="p-6 items-center">
          <Text className="text-lg font-bold text-gray-900 mt-2 mb-4">
            Update Profile Picture
          </Text>

          <TouchableOpacity
            onPress={pickImageFromGallery}
            className="flex-row items-center p-3 rounded-2xl bg-gray-100 mb-3"
          >
            <Ionicons name="images" size={22} color="black" />
            <Text className="ml-3 text-base">Choose from Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={takePhoto}
            className="flex-row items-center p-3 rounded-2xl bg-gray-100 mb-3"
          >
            <Ionicons name="camera" size={22} color="black" />
            <Text className="ml-3 text-base">Take a Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={removePhoto}
            className="flex-row items-center p-3 rounded-2xl bg-red-100"
          >
            <Ionicons name="trash" size={22} color="red" />
            <Text className="ml-3 text-base text-red-500 font-semibold">
              Remove Photo
            </Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}
