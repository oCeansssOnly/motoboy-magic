import { useState, useEffect, useCallback, useRef } from "react";

const LS_DRIVER_ADDR_KEY = "driver_address_v1";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const UPDATE_INTERVAL_MS = 30_000; // refresh every 30s

export interface DriverLocation {
  lat: number;
  lng: number;
  address: string | null;
  timestamp: number;
}

/** Reverse-geocodes lat/lng to a short human-readable address via OSM Nominatim */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    // Build a short address: "Rua X, 123 – Bairro, Cidade"
    const street = [a.road || a.pedestrian || a.path || a.footway || "", a.house_number || ""]
      .filter(Boolean).join(", ");
    const district = a.suburb || a.neighbourhood || a.city_district || a.district || "";
    const city = a.city || a.town || a.village || a.municipality || "";
    return [street, district, city].filter(Boolean).join(" – ") || data.display_name?.split(",").slice(0, 3).join(",") || null;
  } catch {
    return null;
  }
}

export function useDriverLocation() {
  const [location, setLocation] = useState<DriverLocation | null>(() => {
    try {
      const cached = localStorage.getItem(LS_DRIVER_ADDR_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastGeocodedRef = useRef<string>(""); // "lat,lng" of last geocode to skip duplicates

  const updateAddress = useCallback(async (lat: number, lng: number) => {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (key === lastGeocodedRef.current) return; // same location, skip API call
    lastGeocodedRef.current = key;
    const address = await reverseGeocode(lat, lng);
    setLocation(prev => {
      const next = { lat, lng, address, timestamp: Date.now() };
      try { localStorage.setItem(LS_DRIVER_ADDR_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    setLoading(true);

    // Immediate precise fix
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLoading(false);
        await updateAddress(pos.coords.latitude, pos.coords.longitude);
      },
      () => setLoading(false),
      { enableHighAccuracy: true, timeout: 10_000 }
    );

    // Continuous watch for movement
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => updateAddress(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000 }
    );

    // Periodic refresh every 30s (in case watchPosition doesn't fire often enough)
    timerRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => updateAddress(pos.coords.latitude, pos.coords.longitude),
        () => {}
      );
    }, UPDATE_INTERVAL_MS);

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [updateAddress]);

  return { location, loading };
}
