import React, { useEffect, useRef, useState } from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import MapView, { Marker, MapPressEvent, Region } from "react-native-maps";
import * as Location from "expo-location";
import { reverseGeocode } from "@/lib/location";
import { usePersistedLocation } from "@/hooks/usePersistedLocation";

type Props = {
  // (optional) extra styles from header if you need
};

export default function LocationPicker(_: Props) {
  const { loc, setLoc } = usePersistedLocation();
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    (async () => {
      try {
        // start map at current or fallback (Delhi)
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setRegion({
            latitude: 28.6139,
            longitude: 77.2090,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          });
          return;
        }
        const cur = await Location.getCurrentPositionAsync({});
        setRegion({
          latitude: cur.coords.latitude,
          longitude: cur.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      } catch {
        setRegion({
          latitude: 28.6139,
          longitude: 77.2090,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        });
      }
    })();
  }, []);

  const onMapPress = (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPicked({ lat: latitude, lng: longitude });
  };

  const onConfirm = async () => {
    if (!picked) return;
    const place = await reverseGeocode(picked.lat, picked.lng);
    await setLoc({ label: place.label, lat: place.lat, lng: place.lng });
    setOpen(false);
  };

  return (
    <View>
      {/* Button that replaces “NIT HAMIRPUR” */}
      <Pressable style={styles.button} onPress={() => setOpen(true)}>
        <Text style={styles.buttonText}>Choose Location</Text>
      </Pressable>

      {/* Selected label in UPPERCASE under the button */}
      {loc?.label ? (
        <Text style={styles.label}>{loc.label}</Text>
      ) : (
        <Text style={styles.placeholder}>NO LOCATION SELECTED</Text>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Tap on map to pick location</Text>
          {region && (
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              initialRegion={region}
              onPress={onMapPress}
            >
              {picked && (
                <Marker coordinate={{ latitude: picked.lat, longitude: picked.lng }} />
              )}
            </MapView>
          )}

          <View style={styles.modalBar}>
            <Pressable style={[styles.miniBtn, styles.cancel]} onPress={() => setOpen(false)}>
              <Text style={styles.miniBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.miniBtn, !picked && { opacity: 0.5 }]}
              onPress={onConfirm}
              disabled={!picked}
            >
              <Text style={styles.miniBtnText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#111827",
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: { color: "white", fontWeight: "600" },
  label: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  placeholder: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  modal: { flex: 1, backgroundColor: "white" },
  modalTitle: { padding: 16, fontSize: 16, fontWeight: "700" },
  modalBar: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  miniBtn: {
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancel: { backgroundColor: "#6B7280" },
  miniBtnText: { color: "white", fontWeight: "700" },
});
