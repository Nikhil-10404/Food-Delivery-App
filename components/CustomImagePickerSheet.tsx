// import React, { useMemo } from "react";
// import { View, Text, TouchableOpacity } from "react-native";
// import {
//   BottomSheetModal,
//   BottomSheetBackdrop,
// } from "@gorhom/bottom-sheet";
// import { BlurView } from "expo-blur";
// import * as Haptics from "expo-haptics";
// import { Camera, Image as ImageIcon, Trash2 } from "lucide-react-native";
// // If you added the file:
// import LottieView from "lottie-react-native";
// const uploadAnim: any = require("../assets/animations/upload.json");

// type Props = {
//   sheetRef: React.RefObject<BottomSheetModal | null>;
//   onPickGallery: () => void;
//   onPickCamera: () => void;
//   onRemovePhoto: () => void;
// };

// const CustomImagePickerSheet: React.FC<Props> = ({
//   sheetRef,
//   onPickGallery,
//   onPickCamera,
//   onRemovePhoto,
// }) => {
//   const snapPoints = useMemo(() => ["40%"], []);

//   return (
//     <BottomSheetModal
//       ref={sheetRef}
//       snapPoints={snapPoints}
//       enablePanDownToClose
//       backdropComponent={(props) => (
//         <BottomSheetBackdrop
//           {...props}
//           appearsOnIndex={0}
//           disappearsOnIndex={-1}
//         />
//       )}
//       backgroundStyle={{ backgroundColor: "transparent" }}
//       handleIndicatorStyle={{ backgroundColor: "#ccc" }}
//       onChange={(idx) => console.log("🧭 BottomSheetModal index ->", idx)}
//     >
//       <BlurView intensity={80} tint="light" className="flex-1 rounded-t-3xl p-6">
//         <View className="items-center mb-4">
//            {uploadAnim && (
//             <LottieView
//               source={uploadAnim}
//               autoPlay
//               loop
//               style={{ width: 80, height: 80 }}
//             />
//           )}
//           <Text className="text-lg font-bold text-gray-900 mt-2">
//             Update Profile Picture
//           </Text>
//         </View>

//         <TouchableOpacity
//           onPress={() => {
//             Haptics.selectionAsync();
//             onPickGallery();
//           }}
//           className="flex-row items-center p-3 rounded-2xl bg-gray-100 mb-3"
//         >
//           <ImageIcon size={22} color="black" />
//           <Text className="ml-3 text-base">Choose from Gallery</Text>
//         </TouchableOpacity>

//         <TouchableOpacity
//           onPress={() => {
//             Haptics.selectionAsync();
//             onPickCamera();
//           }}
//           className="flex-row items-center p-3 rounded-2xl bg-gray-100 mb-3"
//         >
//           <Camera size={22} color="black" />
//           <Text className="ml-3 text-base">Take a Photo</Text>
//         </TouchableOpacity>

//         <TouchableOpacity
//           onPress={() => {
//             Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
//             onRemovePhoto();
//           }}
//           className="flex-row items-center p-3 rounded-2xl bg-red-100"
//         >
//           <Trash2 size={22} color="red" />
//           <Text className="ml-3 text-base text-red-500 font-semibold">
//             Remove Photo
//           </Text>
//         </TouchableOpacity>
//       </BlurView>
//     </BottomSheetModal>
//   );
// };

// export default CustomImagePickerSheet;
