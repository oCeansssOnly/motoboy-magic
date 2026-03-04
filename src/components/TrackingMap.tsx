import { useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import polyline from "@mapbox/polyline";
import { CourierRoute } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { useDriverEmojis } from "@/hooks/useDriverEmojis";
import { getAppleEmojiUrl, AppleEmoji } from "@/components/AppleEmoji";
import { ShoppingBag, Star, User, Phone, Package, Clock, Flag, MapPin } from "lucide-react";

// Standard icon for Store
const storeIcon = new L.DivIcon({
  html: `<div style="background-color: #1c1c1e; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px rgba(255,255,255,0.2); border: 2px solid rgba(255,255,255,0.3);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/></svg></div>`,
  className: "custom-leaflet-icon",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Dynamic icon generator for each driver 
function getDriverIcon(name: string, speed: number | null | undefined, remainingOrders: number, emoji: string, etaMinutes?: number, isSelected: boolean = false) {
  
  // Floating ETA Pill from the Concept
  const etaHtml = isSelected && etaMinutes ? `
    <div style="position: absolute; top: -50px; left: 50%; transform: translateX(-50%); background: #1c1c1e; border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 4px 12px; display: flex; align-items: center; gap: 6px; font-family: system-ui, -apple-system; box-shadow: 0 8px 24px rgba(0,0,0,0.8); white-space: nowrap; z-index: 1000;">
      <div style="width: 6px; height: 6px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 6px #22c55e;"></div>
      <div style="display: flex; flex-direction: column; align-items: flex-start;">
        <span style="font-size: 7px; color: #a1a1aa; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1;">CHEGADA</span>
        <span style="font-size: 13px; color: white; font-weight: 900; line-height: 1.1; margin-top:1px;">${etaMinutes} <span style="font-size: 9px; font-weight: 600; color: #a1a1aa;">min</span></span>
      </div>
      <div style="margin-left: 4px; color: #f97316;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
    </div>
  ` : '';

  const scale = isSelected ? 'scale(1.0)' : 'scale(0.7)';
  // Concept uses a dark circle with a glowing orange outline
  const glow = isSelected ? '0 0 0 2px rgba(249, 115, 22, 0.4), 0 0 10px 2px rgba(249, 115, 22, 0.4)' : '0 2px 8px rgba(0,0,0,0.5)';
  const border = isSelected ? '#f97316' : 'rgba(255,255,255,0.15)';
  const bg = '#1c1c1e';

  return new L.DivIcon({
    html: `
      <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; z-index: ${isSelected ? 500 : 100};">
        ${etaHtml}
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 10px; height: 10px; background: ${bg}; border-radius: 50%; box-shadow: ${glow}; border: 1px solid ${border}; transform: ${scale}; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);">
          <img src="${getAppleEmojiUrl(emoji)}" alt="emoji" width="7" height="7" style="object-fit: contain; pointer-events: none; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.8));" onerror="this.style.display='none'" />
        </div>
      </div>
    `,
    className: "custom-leaflet-icon",
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

// Color palette for routes so each driver's path looks distinct
const ROUTE_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"];

interface TrackingMapProps {
  storeLat: number | null;
  storeLng: number | null;
  routes: CourierRoute[];
}

interface ActiveDriver {
  lat: number;
  lng: number;
  speed?: number | null;
  address?: string | null;
  timestamp: number;
}

export function TrackingMap({ storeLat, storeLng, routes }: TrackingMapProps) {
  const [activeDrivers, setActiveDrivers] = useState<Record<string, ActiveDriver>>({});
  const [osrmCache, setOsrmCache] = useState<Record<string, { geom: [number, number][]; duration: number }>>({});
  const driverEmojis = useDriverEmojis();
  const [isCardExpanded, setIsCardExpanded] = useState(true);
  
  const [selectedDriverName, setSelectedDriverName] = useState<string | null>(null);
  const selectedDriverNameRef = useRef<string | null>(null);
  useEffect(() => { selectedDriverNameRef.current = selectedDriverName; }, [selectedDriverName]);

  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // 1. Subscribe to real-time location broadcasts
  useEffect(() => {
    const channel = supabase.channel("driver-tracking");
    
    channel
      .on("broadcast", { event: "location_update" }, (payload) => {
        const data = payload.payload as { driverName: string; lat: number; lng: number; speed?: number | null; address?: string | null; timestamp: number };
        setActiveDrivers(prev => {
          const prevData = prev[data.driverName.toLowerCase()];
          const next = {
            ...prev,
            [data.driverName.toLowerCase()]: {
              lat: data.lat,
              lng: data.lng,
              speed: data.speed !== undefined ? data.speed : prevData?.speed,
              address: data.address !== undefined ? data.address : prevData?.address,
              timestamp: data.timestamp
            }
          };
          
          const selected = selectedDriverNameRef.current;
          if (selected && selected.toLowerCase() === data.driverName.toLowerCase() && mapRef.current) {
             mapRef.current.setView([data.lat, data.lng], mapRef.current.getZoom(), { animate: true, duration: 0.5 });
          }
          
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 2. Remove stale drivers (no updates for > 5 mins)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setActiveDrivers(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [name, data] of Object.entries(next)) {
          if (now - data.timestamp > 5 * 60 * 1000) {
            delete next[name];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 60_000); // Check once a minute
    return () => clearInterval(interval);
  }, []);

  // 3. Fetch OSRM Geometries for active routes dynamically
  useEffect(() => {
    if (!storeLat || !storeLng) return;
    
    routes.forEach(route => {
      const activeOrders = route.orders.filter(o => !o.confirmed);
      if (activeOrders.length === 0) return;
      
      const driverName = route.name.toLowerCase();
      const liveDriver = activeDrivers[driverName];
      
      // Determine dynamic start position (Live Driver GPS if active, else Store)
      let startLng = storeLng;
      let startLat = storeLat;
      
      // To ensure route updates periodically as driver moves, we use their rounded coord directly in the cache key
      // or throttle fetches based on position
      if (liveDriver && liveDriver.lat && liveDriver.lng) {
        startLng = liveDriver.lng;
        startLat = liveDriver.lat;
      }
      
      // We round coords to 4 decimals (approx 11m) so we don't spam OSRM if they only moved 1 meter
      const posKey = `${startLat.toFixed(4)}-${startLng.toFixed(4)}`;
      const genericKey = `${route.id}-${activeOrders.map(o => o.id).join('-')}`;
      
      const nextOrder = activeOrders[0];
      const futureOrders = activeOrders.slice(1);

      // --- FETCH SEGMENT 1 (Driver to Next Order) ---
      if (nextOrder.lat && nextOrder.lng) {
        const cacheKey1 = `${genericKey}-seg1-${posKey}`;
        if (!osrmCache[cacheKey1] && !osrmCache[cacheKey1 + '_fetching']) {
          setOsrmCache(prev => ({ ...prev, [cacheKey1 + '_fetching']: { geom: [], duration: 0 } }));
          
          const coords1 = `${startLng},${startLat};${nextOrder.lng},${nextOrder.lat}`;
          fetch(`https://router.project-osrm.org/route/v1/driving/${coords1}?overview=full`)
            .then(r => r.json())
            .then(data => {
              if (data.routes && data.routes[0] && data.routes[0].geometry) {
                const decoded = polyline.decode(data.routes[0].geometry) as [number, number][];
                setOsrmCache(p => ({ 
                   ...p, 
                   [cacheKey1]: { geom: decoded, duration: data.routes[0].duration },
                   [genericKey + '_seg1_latest']: { geom: decoded, duration: data.routes[0].duration }
                }));
              }
            }).catch(() => {});
        }
      }

      // --- FETCH SEGMENT 2 (Next Order to all following orders) ---
      if (futureOrders.length > 0 && nextOrder.lat && nextOrder.lng) {
        const cacheKey2 = `${genericKey}-seg2-static`; // This segment doesn't depend on driver's live pos!
        if (!osrmCache[cacheKey2] && !osrmCache[cacheKey2 + '_fetching']) {
           setOsrmCache(prev => ({ ...prev, [cacheKey2 + '_fetching']: { geom: [], duration: 0 } }));
           
           const coords2 = [[nextOrder.lng, nextOrder.lat]];
           futureOrders.forEach(o => { if (o.lat && o.lng) coords2.push([o.lng, o.lat]) });
           if (coords2.length >= 2) {
             const coordsStr = coords2.map(c => `${c[0]},${c[1]}`).join(';');
             fetch(`https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full`)
               .then(r => r.json())
               .then(data => {
                 if (data.routes && data.routes[0] && data.routes[0].geometry) {
                   const decoded = polyline.decode(data.routes[0].geometry) as [number, number][];
                   setOsrmCache(p => ({ 
                      ...p, 
                      [cacheKey2]: { geom: decoded, duration: data.routes[0].duration },
                      [genericKey + '_seg2_latest']: { geom: decoded, duration: data.routes[0].duration }
                   }));
                 }
               }).catch(() => {});
           }
        }
      }
    });
  }, [routes, storeLat, storeLng, osrmCache, activeDrivers]);

  // 4. Initialize Map via vanilla Leaflet
  useEffect(() => {
    if (!containerRef.current || !storeLat || !storeLng || mapRef.current) return;

    const defaultCenter: [number, number] = [storeLat, storeLng];
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView(defaultCenter, 13);
    mapRef.current = map;

    // Concept uses a very dark clean basemap
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '',
      maxZoom: 19,
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);

    // Robust size invalidation
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Ensure Leaflet recalculates bounds after structural CSS is painted (fixes black screen on mobile)
    setTimeout(() => map.invalidateSize(), 50);
    setTimeout(() => map.invalidateSize(), 300);

    return () => {
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [storeLat, storeLng]);

  // 4a. Update map center dynamically if store coordinates change
  useEffect(() => {
    if (mapRef.current && storeLat && storeLng) {
      mapRef.current.setView([storeLat, storeLng]);
    }
  }, [storeLat, storeLng]);

  // 5. Render map entities natively
  useEffect(() => {
    if (!layerGroupRef.current || !storeLat || !storeLng) return;

    layerGroupRef.current.clearLayers();

    // Store Marker
    L.marker([storeLat, storeLng], { icon: storeIcon })
      .bindPopup('<div style="text-align: center; font-weight: 600;">📍 Loja</div>')
      .addTo(layerGroupRef.current);

    // Live Driver Markers
    Object.entries(activeDrivers).forEach(([lowerName, data]) => {
      // Find how many active orders this driver has left
      const routeForDriver = routes.find(r => r.name.toLowerCase() === lowerName.toLowerCase());
      const remainingOrders = routeForDriver ? routeForDriver.orders.filter(o => !o.confirmed).length : 0;
      
      // Get exact casing from route if available, otherwise fallback
      const realNameMatch = Object.keys(driverEmojis).find(k => k.toLowerCase() === lowerName.toLowerCase());
      const realName = routeForDriver ? routeForDriver.name : (realNameMatch || lowerName);
      const emoji = realNameMatch ? driverEmojis[realNameMatch] : "🏍️";

      // Calculate ETA from OSRM cache
      let etaNextStop: number | undefined;
      let etaFinalDest: number | undefined;

      if (routeForDriver) {
        const activeOrders = routeForDriver.orders.filter(o => !o.confirmed);
        const genericKey = `${routeForDriver.id}-${activeOrders.map(o => o.id).join('-')}`;
        // Prioritize dynamic latest route based on their live movement
        const cached1 = osrmCache[genericKey + '_seg1_latest'];
        const cached2 = osrmCache[genericKey + '_seg2_latest'];
        
        if (cached1) {
          etaNextStop = Math.round(cached1.duration / 60);
          if (cached2) {
            etaFinalDest = Math.round((cached1.duration + cached2.duration) / 60);
          } else {
            etaFinalDest = etaNextStop;
          }
        }
      }
      
      const isSelected = selectedDriverName ? selectedDriverName.toLowerCase() === realName.toLowerCase() : true;
      const marker = L.marker([data.lat, data.lng], { icon: getDriverIcon(realName, data.speed, remainingOrders, emoji, etaNextStop, isSelected) });
      layerGroupRef.current?.addLayer(marker);
    });

    // Route Polylines and Waypoints
    routes.filter(r => r.orders.some(o => !o.confirmed)).forEach((route, i) => {
      const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
      const activeOrders = route.orders.filter(o => !o.confirmed);
      const genericKey = `${route.id}-${activeOrders.map(o => o.id).join('-')}`;
      const cached1 = osrmCache[genericKey + '_seg1_latest'];
      const cached2 = osrmCache[genericKey + '_seg2_latest'];

      const isSelected = selectedDriverName ? selectedDriverName.toLowerCase() === route.name.toLowerCase() : true;
      const opacityMultiplier = isSelected ? 1 : 0.2;

      // Draw Numbered Markers for each drop-off
      activeOrders.forEach((o, index) => {
        if (!o.lat || !o.lng) return;
        
        const originalIndex = route.orders.findIndex(ord => ord.id === o.id);
        const displayNum = originalIndex >= 0 ? originalIndex + 1 : index + 1;
        
        const borderColor = isSelected ? (index === 0 ? "#22c55e" : "rgba(255,255,255,0.4)") : "rgba(255,255,255,0.2)";
        const numberIcon = new L.DivIcon({
          html: `<div style="background-color: ${index === 0 && isSelected ? '#166534' : '#1c1c1e'}; color: white; border: 2px solid ${borderColor}; width: 20px; height: 20px; border-radius: 50%; font-weight: bold; font-size: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(0,0,0,0.5); opacity: ${opacityMultiplier}; transition: all 0.3s;">${displayNum}</div>`,
          className: "custom-number-icon",
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        L.marker([o.lat, o.lng], { icon: numberIcon })
          .addTo(layerGroupRef.current!);
      });
      
      const drawGlowingRoute = (latlngs: [number, number][]) => {
         if (!isSelected) {
            L.polyline(latlngs, { color: "#555", weight: 3, opacity: 0.5 }).addTo(layerGroupRef.current!);
            return;
         }
         // Outer thick glow
         L.polyline(latlngs, { color: "#f97316", weight: 16, opacity: 0.15, lineCap: "round", lineJoin: "round" }).addTo(layerGroupRef.current!);
         // Mid glow
         L.polyline(latlngs, { color: "#f97316", weight: 8, opacity: 0.4, lineCap: "round", lineJoin: "round" }).addTo(layerGroupRef.current!);
         // Bright core line
         L.polyline(latlngs, { color: "#fff7ed", weight: 3, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(layerGroupRef.current!);
      };

      const drawDimmedRoute = (latlngs: [number, number][]) => {
         L.polyline(latlngs, { color: isSelected ? "#9c351b" : "#444", weight: 3, opacity: isSelected ? 0.8 : 0.3, lineCap: "round", lineJoin: "round" }).addTo(layerGroupRef.current!);
         // Add a subtle dashed overlay to differentiate the future route
         L.polyline(latlngs, { color: "#fff", weight: 1, opacity: isSelected ? 0.3 : 0.1, dashArray: "4 8" }).addTo(layerGroupRef.current!);
      };

      if (cached1 && cached1.geom) {
        drawGlowingRoute(cached1.geom);
      }
      if (cached2 && cached2.geom) {
        drawDimmedRoute(cached2.geom);
      }
    });

  }, [storeLat, storeLng, activeDrivers, routes, osrmCache]);

  if (!storeLat || !storeLng) {
    return (
      <div className="w-full h-96 bg-secondary/30 rounded-3xl flex items-center justify-center border border-border shadow-inner">
        <p className="text-muted-foreground text-sm font-medium">Aguardando localização da loja...</p>
      </div>
    );
  }

  const focusOnDriver = (driverName: string) => {
    setSelectedDriverName(driverName);
    const data = activeDrivers[driverName.toLowerCase()];
    if (data && mapRef.current) {
        // Offset the lat further north so the driver icon doesn't end up hidden by the card at the bottom
        // A larger offset so they are framed in the upper third of the screen
        const offsetLat = data.lat - 0.0040;
        mapRef.current.setView([offsetLat, data.lng], 16, { animate: true, duration: 1 });
    }
  };

  // Auto-select first driver if none selected and drivers exist
  useEffect(() => {
    if (!selectedDriverName && Object.keys(activeDrivers).length > 0) {
      const firstDriver = Object.keys(activeDrivers)[0];
      const routeForDriver = routes.find(r => r.name.toLowerCase() === firstDriver);
      focusOnDriver(routeForDriver ? routeForDriver.name : firstDriver);
    }
  }, [activeDrivers, selectedDriverName, routes]);

  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, backgroundColor: "#0a0a0c", overflow: "hidden" }}>
      {/* Map Content */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, backgroundColor: "#0a0a0c" }}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0, backgroundColor: "#0a0a0c" }} />
      </div>

      {/* Bottom Container */}
      <div 
        className={`absolute left-0 right-0 z-[400] flex flex-col items-center pointer-events-none pb-safe transition-all duration-300 ease-out ${
          isCardExpanded ? 'bottom-[90px] sm:bottom-[110px]' : 'bottom-[130px] sm:bottom-[150px]'
        }`}
      >
        
        {/* Main Driver Card / Pill Wrapper */}
        <div className="w-full px-4 sm:px-0 sm:w-[360px] relative flex flex-col items-center">
          {selectedDriverName && activeDrivers[selectedDriverName.toLowerCase()] && (() => {
             const lowerName = selectedDriverName.toLowerCase();
             const data = activeDrivers[lowerName];
             const routeObj = routes.find(r => r.name.toLowerCase() === lowerName);
             const realNameMatch = Object.keys(driverEmojis).find(k => k.toLowerCase() === lowerName.toLowerCase());
             const realName = routeObj ? routeObj.name : (realNameMatch || selectedDriverName);
             const emoji = realNameMatch ? driverEmojis[realNameMatch] : "🏍️";
             
             const totalOrders = routeObj ? routeObj.orders.length : 0;
             const remaining = routeObj ? routeObj.orders.filter(o => !o.confirmed).length : 0;
             const completedOrders = totalOrders - remaining;
             const nextOrder = routeObj ? routeObj.orders.find(o => !o.confirmed) : null;
             
             const progressPercent = totalOrders > 0 ? Math.min(100, Math.max(15, ((completedOrders + 0.5) / totalOrders) * 100)) : 0;

             // RE-CALCULATE ETA FOR THIS IIFE SCOPE
             let etaNextStop: number | undefined;
             let etaFinalDest: number | undefined;

             if (routeObj) {
               const activeOrders = routeObj.orders.filter(o => !o.confirmed);
               const genericKey = `${routeObj.id}-${activeOrders.map(o => o.id).join('-')}`;
               const cached1 = osrmCache[genericKey + '_seg1_latest'];
               const cached2 = osrmCache[genericKey + '_seg2_latest'];
               
               if (cached1) {
                 etaNextStop = Math.round(cached1.duration / 60);
                 if (cached2) {
                   etaFinalDest = Math.round((cached1.duration + cached2.duration) / 60);
                 } else {
                   etaFinalDest = etaNextStop;
                 }
               }
             }

             return (
               <div className="w-full relative flex items-center justify-center">
                 {/* COLLAPSED PILL */}
                 <div 
                   onClick={() => setIsCardExpanded(true)}
                   style={{
                     position: isCardExpanded ? 'absolute' : 'relative',
                     opacity: isCardExpanded ? 0 : 1,
                     transform: isCardExpanded ? 'scale(0.8) translateY(20px)' : 'scale(1) translateY(0)',
                     pointerEvents: isCardExpanded ? 'none' : 'auto'
                   }}
                   className="bg-[#1c1c1e]/90 backdrop-blur-[20px] rounded-full p-2 px-3 shadow-xl border border-white/10 flex items-center justify-between cursor-pointer w-[220px] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-10 hover:bg-white/5"
                 >
                   <div className="flex items-center gap-2">
                     <AppleEmoji name={emoji} size={14} />
                     <h3 className="text-white font-bold text-xs">{realName}</h3>
                   </div>
                   <div className="flex items-center gap-2">
                     <p className="text-[#8e8e93] text-[10px] font-medium">
                       {data.speed !== null && data.speed !== undefined ? Math.round(data.speed * 3.6) : 0} km/h
                     </p>
                     <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center">
                       <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                     </div>
                   </div>
                 </div>

                 {/* EXPANDED CARD */}
                 <div
                   style={{
                     position: !isCardExpanded ? 'absolute' : 'relative',
                     opacity: !isCardExpanded ? 0 : 1,
                     transform: !isCardExpanded ? 'scale(0.9) translateY(20px)' : 'scale(1) translateY(0)',
                     pointerEvents: !isCardExpanded ? 'none' : 'auto'
                   }}
                   className="w-full bg-[#1c1c1e]/95 backdrop-blur-[20px] rounded-3xl p-4 shadow-2xl border border-white/10 flex flex-col gap-3 relative transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-20"
                 >
                      {/* Subtle Orange Glow behind text */}
                      <div className="absolute -top-10 left-12 w-32 h-32 bg-orange-500/10 blur-[40px] rounded-full pointer-events-none"></div>
                      
                      {/* Collapse Button */}
                      <button 
                        onClick={() => setIsCardExpanded(false)}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center z-20 transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </button>

                       <div className="flex justify-between items-start z-10 w-full mb-0">
                        <div className="flex-1 min-w-0 pr-8">
                          <h2 className="text-white font-bold text-base sm:text-lg mb-0.5 truncate leading-tight">
                            {nextOrder ? "A caminho" : "Finalizado"}
                          </h2>
                          <div className="flex flex-col gap-0.5">
                            <p className="text-[#8e8e93] text-xs truncate">
                               {nextOrder ? `Pedido #${nextOrder.displayId} - ${nextOrder.customerName}` : 'Sem entregas'}
                            </p>
                            {nextOrder && (
                              <div className="flex items-center gap-3 mt-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full border border-orange-400/20">
                                  <Clock size={10} />
                                  <span>Próximo: {etaNextStop || '--'} m</span>
                                </div>
                                {etaFinalDest && etaFinalDest > (etaNextStop || 0) && (
                                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full border border-blue-400/20">
                                    <Flag size={10} />
                                    <span>Total: {etaFinalDest} m</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Concept Progress Bar */}
                      <div className="mb-0 z-10 mt-1">
                        <div className="flex justify-between text-[10px] font-bold text-[#8e8e93] mb-1.5 uppercase tracking-wide px-0.5">
                          <span>Progresso</span>
                          <span className="text-white">{completedOrders} de {totalOrders}</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.6)] transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="w-full h-[1px] bg-white/5 my-1.5 z-10"></div>

                      {/* Driver Profile Section */}
                      <div className="flex items-center gap-3 z-10">
                        <div className="relative flex-shrink-0">
                          <div className="w-10 h-10 rounded-full bg-[#2c2c2e] flex items-center justify-center border-2 border-[#1c1c1e] shadow-lg overflow-hidden">
                             <AppleEmoji name={emoji} size={22} />
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-bold text-sm truncate leading-tight">{realName}</h3>
                          <div className="flex flex-col gap-1 mt-0.5">
                            <div className="flex items-center gap-2">
                              <p className="text-[#8e8e93] text-[11px] font-medium truncate opacity-90">
                                {data.speed !== null && data.speed !== undefined ? Math.round(data.speed * 3.6) : 0} km/h
                              </p>
                              <div className="bg-[#1c1c1e] text-white text-[9px] font-black px-1.5 py-0.5 rounded-md flex items-center border border-white/10 whitespace-nowrap">
                                <Package size={8} className="mr-1 text-blue-400" /> {completedOrders}
                              </div>
                            </div>
                            {data.address && (
                              <div className="flex items-center gap-1 text-[10px] text-[#8e8e93] truncate max-w-full">
                                <MapPin size={10} className="flex-shrink-0 text-orange-500/70" />
                                <span className="truncate">{data.address}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex gap-2 flex-shrink-0">
                          <div 
                            onClick={() => nextOrder && window.open(`https://portal.ifood.com.br/orders?orderId=${nextOrder.id}`, '_blank')}
                            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors ${nextOrder ? 'bg-white/10 text-white cursor-pointer hover:bg-white/20 border-white/5' : 'bg-white/5 text-white/30 cursor-not-allowed border-transparent'}`}
                          >
                            <ShoppingBag size={14} strokeWidth={2} />
                          </div>
                          <div 
                            onClick={() => nextOrder?.customerPhone && window.open(`tel:${nextOrder.customerPhone}`)}
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors border ${nextOrder?.customerPhone ? 'bg-green-500/20 text-green-500 cursor-pointer hover:bg-green-500/30 border-green-500/20' : 'bg-white/5 text-white/20 cursor-not-allowed border-white/5'}`}
                            title="Ligar para Cliente"
                          >
                            <Phone size={14} className="fill-current" />
                          </div>
                        </div>
                      </div>
                   </div>
                 </div>
             );
          })()}
        </div>

        {/* Unselected Drivers Row (Only visible when card is Expanded to avoid clutter when collapsed, or render normally) */}
        <div 
          style={{
             opacity: isCardExpanded ? 1 : 0,
             transform: isCardExpanded ? 'translateY(0)' : 'translateY(-10px)',
             pointerEvents: isCardExpanded ? 'auto' : 'none',
             maxHeight: isCardExpanded ? '100px' : '0'
          }}
          className="transition-all duration-300 ease-out w-full flex justify-center mt-3"
        >
          {Object.keys(activeDrivers).length > 1 && (
             <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 snap-x px-4 max-w-full">
               {Object.keys(activeDrivers).map(lowerName => {
                 if (lowerName === selectedDriverName?.toLowerCase()) return null;
                 const routeObj = routes.find(r => r.name.toLowerCase() === lowerName);
                 const realNameMatch = Object.keys(driverEmojis).find(k => k.toLowerCase() === lowerName.toLowerCase());
                 const realName = routeObj ? routeObj.name : (realNameMatch || lowerName);
                 const emoji = realNameMatch ? driverEmojis[realNameMatch] : "🏍️";
                 return (
                   <button 
                     key={lowerName} 
                     onClick={() => {
                        focusOnDriver(realName);
                        setIsCardExpanded(true); // Auto-expand when selecting a different driver
                     }} 
                     className="snap-start flex-shrink-0 w-11 h-11 rounded-full bg-[#1c1c1e]/80 backdrop-blur-md border border-white/10 overflow-hidden flex items-center justify-center hover:border-white/30 transition-colors shadow-lg"
                   >
                     <AppleEmoji name={emoji} size={22} />
                   </button>
                 )
               })}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
