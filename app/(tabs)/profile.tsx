import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { View, Text, Image, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { storage, databases, ID, getCurrentUser, appwriteConfig } from "@/lib/appwrite";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Permission, Role } from "appwrite";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";

/* ---------- Helpers ---------- */

const Divider = () => <View className="h-[1px] bg-gray-100 my-4" />;

const getViewUrlFromFileId = (fileId: string): string => {
  const endpoint = appwriteConfig.endpoint.replace(/\/+$/, "");
  return `${endpoint}/storage/buckets/${appwriteConfig.bucketId}/files/${fileId}/view?project=${appwriteConfig.projectId}`;
};
const withCache = (url: string) => `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
const normalizeAvatarToViewUrl = (
  value?: string | null
): { url: string | null; fileId?: string } => {
  if (!value) return { url: null };
  if (value.startsWith("http")) {
    const mPrev = value.match(/\/files\/([^/]+)\/preview/);
    if (mPrev?.[1]) return { url: getViewUrlFromFileId(mPrev[1]), fileId: mPrev[1] };
    const mView = value.match(/\/files\/([^/]+)\/view/);
    if (mView?.[1]) return { url: value, fileId: mView[1] };
    return { url: value };
  }
  return { url: getViewUrlFromFileId(value), fileId: value };
};

/* ---------- Component ---------- */

export default function ProfileScreen() {
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [oldAvatarId, setOldAvatarId] = useState<string | null>(null);

  const avatarSheetRef = useRef<BottomSheetModal | null>(null);
  const snapPoints = useMemo(() => ["40%", "70%"], []);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userDoc = await getCurrentUser();
        if (!userDoc) return;
        setUser(userDoc);

        const { url, fileId } = normalizeAvatarToViewUrl(userDoc.avatar);
        if (fileId) setOldAvatarId(fileId);
        setProfileImage(url ? withCache(url) : null);
      } catch (err) {
        console.error("Error fetching user:", err);
      }
    };
    fetchUser();
  }, []);

    useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const userDoc = await getCurrentUser();
          if (!userDoc) return;

          setUser(userDoc);
          const { url, fileId } = normalizeAvatarToViewUrl(userDoc.avatar);
          if (fileId) setOldAvatarId(fileId);
          setProfileImage(url ? withCache(url) : null);
        } catch (e) {
          console.warn("refetch failed", e);
        }
      })();
    }, [])
  );

  const uploadToAppwrite = async (uri: string) => {
    try {
      setLoading(true);
      const fileName = uri.split("/").pop() || `photo_${Date.now()}.jpg`;
      const res = await fetch(uri);
      const blob = await res.blob();
      const file: any = { uri, name: fileName, type: blob.type || "image/jpeg", size: blob.size };

      const uploadedFile = await storage.createFile(
        appwriteConfig.bucketId,
        ID.unique(),
        file,
        [
          Permission.read(Role.any()),
          Permission.write(Role.any()),
        ]
      );

      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userCollectionId,
        user.$id,
        { avatar: uploadedFile.$id }
      );

      if (oldAvatarId && oldAvatarId !== uploadedFile.$id) {
        try { await storage.deleteFile(appwriteConfig.bucketId, oldAvatarId); } catch {}
      }
      setOldAvatarId(uploadedFile.$id);

      const displayUrl = withCache(getViewUrlFromFileId(uploadedFile.$id));
      setProfileImage(displayUrl);
      Alert.alert("✅ Success", "Profile photo updated!");
    } catch (err: any) {
      console.error("Upload error:", err);
      Alert.alert("❌ Error", err?.message ?? "Failed to update profile photo.");
    } finally {
      setLoading(false);
      avatarSheetRef.current?.dismiss();
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
        { avatar: null }
      );
      setOldAvatarId(null);
      setProfileImage(null);
      Alert.alert("✅ Removed", "Profile photo reset.");
    } catch (err: any) {
      console.error("Remove error:", err);
      Alert.alert("❌ Error", err?.message ?? "Failed to remove profile photo.");
    } finally {
      setLoading(false);
      avatarSheetRef.current?.dismiss();
    }
  };

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

  const openAvatarSheet = useCallback(() => avatarSheetRef.current?.present(), []);

  const InfoRow = ({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | number | null;
}) => (
  <View className="flex-row items-center">
    <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
      <Ionicons name={icon} size={20} color="#f97316" />
    </View>
    <View className="flex-1">
      <Text className="text-[11px] text-gray-400 tracking-wide">{label}</Text>
      <Text
        numberOfLines={1}
        className="text-[16px] font-semibold text-gray-900 mt-0.5"
      >
        {value ? String(value) : "Not set"}
      </Text>
    </View>
  </View>
);
  return (
    <View className="flex-1 bg-[#f9fafb]">
      {/* Header */}
      <View className="px-5 pt-12 pb-4 flex-row items-center">
        <TouchableOpacity
          onPress={() => router.replace("/")}
          className="w-9 h-9 rounded-full bg-white items-center justify-center shadow"
        >
          <Ionicons name="chevron-back" size={20} color="#111827" />
        </TouchableOpacity>
<Text className="flex-1 text-center text-2xl font-bold text-gray-900 mr-12">
  Profile
</Text>

      </View>

      {/* Avatar */}
      <View className="items-center mt-2">
        <View className="relative">
          {loading ? (
            <ActivityIndicator size="large" color="#f97316" />
          ) : profileImage ? (
            <Image
              source={{ uri: profileImage }}
              className="w-40 h-40 rounded-full"
              onError={() => setProfileImage(null)}
            />
          ) : (
            <View className="w-24 h-24 rounded-full bg-orange-200 items-center justify-center">
              <Text className="text-5xl font-bold text-orange-700">
                {user?.name ? user.name.charAt(0).toUpperCase() : "?"}
              </Text>
            </View>
          )}

          <TouchableOpacity
  onPress={openAvatarSheet}
  className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-orange-500 items-center justify-center border-4 border-white"
>
  <Ionicons name="pencil" size={20} color="#fff" />
</TouchableOpacity>
        </View>
      </View>

      {/* Info card */}
      {/* Info card */}
<View className="mx-5 mt-6 bg-white rounded-2xl p-5 shadow-sm border border-gray-50">
  <InfoRow icon="person-outline" label="Full Name" value={user?.name} />
  <Divider />
  <InfoRow icon="mail-outline" label="Email" value={user?.email} />
  <Divider />
  <InfoRow
    icon="call-outline"
    label="Phone number"
    value={user?.phone ? `+91 ${user.phone}` : "Not set"}
  />
</View>


      {/* Edit Profile Button */}
      <View className="px-5 mt-6">
       <TouchableOpacity
  onPress={() => router.push("/edit-profile")}
  className="bg-orange-500/90 py-4 rounded-2xl items-center"
  activeOpacity={0.8}
>
  <Text className="text-white font-semibold">Edit Profile</Text>
</TouchableOpacity>
      </View>

      {/* Avatar Bottom Sheet */}
      <BottomSheetModal
        ref={avatarSheetRef}
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
            className="flex-row items-center p-3 rounded-2xl bg-gray-100 mb-3 w-full justify-center"
          >
            <Ionicons name="images" size={22} color="black" />
            <Text className="ml-3 text-base">Choose from Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={takePhoto}
            className="flex-row items-center p-3 rounded-2xl bg-gray-100 mb-3 w-full justify-center"
          >
            <Ionicons name="camera" size={22} color="black" />
            <Text className="ml-3 text-base">Take a Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={removePhoto}
            className="flex-row items-center p-3 rounded-2xl bg-red-100 w-full justify-center"
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
