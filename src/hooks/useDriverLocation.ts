import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const LS_DRIVER_ADDR_KEY = "driver_address_v1";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const UPDATE_INTERVAL_MS = 10_000; // refresh location locally every 10s
const BROADCAST_INTERVAL_MS = 5_000; // send broadcast max every 5s

export interface DriverLocation {
  lat: number;
  lng: number;
  address: string | null;
  timestamp: number;
}

// Haversine distance in meters
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

import { requestWakeLock, releaseWakeLock, startSilentAudio, stopSilentAudio } from "@/lib/backgroundTracking";

export function useDriverLocation(driverName: string | null, backgroundMode: boolean = false) {
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastBroadcastRef = useRef<number>(0);
  const lastLocationRef = useRef<{lat: number, lng: number, time: number} | null>(null);

  // Background Mode Management
  useEffect(() => {
    if (backgroundMode && driverName) {
      requestWakeLock();
      startSilentAudio();
    } else {
      releaseWakeLock();
      stopSilentAudio();
    }
    
    return () => {
      releaseWakeLock();
      stopSilentAudio();
    };
  }, [backgroundMode, driverName]);

  // Initialize broadcast channel
  useEffect(() => {
    if (!driverName) return;
    const channel = supabase.channel("driver-tracking");
    channel.subscribe((status) => {
      console.log("[driver-tracking] status:", status);
    });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [driverName]);

  const updateAddress = useCallback(async (lat: number, lng: number, providedSpeed: number | null) => {
    // 1. Broadcast the raw location instantly (if cooldown passed)
    const now = Date.now();
    let speed = providedSpeed;

    // Calculate speed manually if device doesn't provide it
    if ((speed === null || speed === 0) && lastLocationRef.current) {
      const dist = haversineMeters(lastLocationRef.current.lat, lastLocationRef.current.lng, lat, lng);
      const timeSecs = (now - lastLocationRef.current.time) / 1000;
      
      // Calculate manual speed if we moved at least 2 meters
      if (dist > 2 && timeSecs > 0) {
        speed = dist / timeSecs;
        // Cap max manual speed calculation to ~120 km/h (33 m/s) to prevent GPS flutter spikes
        if (speed > 33) speed = 33; 
        
        lastLocationRef.current = { lat, lng, time: now };
      } else if (dist <= 2 && timeSecs > 15) {
        // If 15 seconds passed without moving > 2m, assume stopped
        speed = 0;
        lastLocationRef.current = { lat, lng, time: now };
      } else {
        // Keep previous valid speed in UI (don't send 0 just yet to avoid flutter)
        // by leaving speed as null, which we will NOT broadcast. We'll only broadcast if we have a valid speed or definitely stopped.
        speed = null;
      }
    } else if (speed !== null && speed > 0) {
       // Valid GPS speed came through
       lastLocationRef.current = { lat, lng, time: now };
    } else if (!lastLocationRef.current) {
       lastLocationRef.current = { lat, lng, time: now };
    }

    if (driverName && channelRef.current && (now - lastBroadcastRef.current > BROADCAST_INTERVAL_MS)) {
      if (speed !== null) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'location_update',
          payload: { driverName, lat, lng, speed, timestamp: now }
        });
        lastBroadcastRef.current = now;
      } else {
        // Broadcast location only without overriding the last known speed 
        channelRef.current.send({
          type: 'broadcast',
          event: 'location_update',
          payload: { driverName, lat, lng, timestamp: now }
        });
        lastBroadcastRef.current = now;
      }
    }

    // 2. Perform heavy geocoding only if moved significantly
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const address = await reverseGeocode(lat, lng);
    
    // Broadcast again with the geocoded address
    if (driverName && channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'location_update',
        payload: { driverName, lat, lng, address, timestamp: Date.now() }
      });
      lastBroadcastRef.current = Date.now();
    }

    setLocation(prev => {
      const next = { lat, lng, address, timestamp: Date.now() };
      try { localStorage.setItem(LS_DRIVER_ADDR_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [driverName]);

  useEffect(() => {
    if (!navigator.geolocation || !driverName) return;

    setLoading(true);

    // Immediate precise fix
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLoading(false);
        await updateAddress(pos.coords.latitude, pos.coords.longitude, pos.coords.speed);
      },
      () => setLoading(false),
      { enableHighAccuracy: true, timeout: 10_000 }
    );

    // Continuous watch for movement
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => updateAddress(pos.coords.latitude, pos.coords.longitude, pos.coords.speed),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );

    // Periodic refresh
    timerRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => updateAddress(pos.coords.latitude, pos.coords.longitude, pos.coords.speed),
        () => {}
      );
    }, UPDATE_INTERVAL_MS);

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [updateAddress, driverName]);

  return { location, loading };
}

