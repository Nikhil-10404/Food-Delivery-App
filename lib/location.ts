import * as Location from "expo-location";

export type PrettyPlace = {
  city: string;
  state: string;
  country: string;
  label: string; // CITY, STATE, COUNTRY
  lat: number;
  lng: number;
};

export function toPrettyLabel(city?: string | null, state?: string | null, country?: string | null) {
  const parts = [city, state, country].filter(Boolean).map(s => String(s).trim());
  return parts.join(", ").toUpperCase();
}

export async function reverseGeocode(lat: number, lng: number): Promise<PrettyPlace> {
  const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
  const first = results?.[0];

  const city = first?.city || first?.district || first?.subregion || "";
  const state = first?.region || first?.subregion || "";
  const country = first?.country || "";

  return {
    city,
    state,
    country,
    label: toPrettyLabel(city, state, country),
    lat,
    lng,
  };
}
