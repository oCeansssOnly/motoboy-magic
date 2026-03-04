import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useDriverEmojis() {
  const [emojis, setEmojis] = useState<Record<string, string>>({});

  useEffect(() => {
    // Initial fetch
    supabase
      .from("drivers")
      .select("name, notes")
      .then(({ data, error }) => {
        if (!error && data) {
          const map: Record<string, string> = {};
          data.forEach(d => {
            if (d.name && d.notes) {
              map[d.name] = d.notes;
            }
          });
          setEmojis(map);
        }
      });

    // Realtime subscription
    const channel = supabase
      .channel("driver-emojis-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        (payload) => {
          const newDoc = payload.new as { name?: string; notes?: string | null };
          if (newDoc && newDoc.name) {
            setEmojis((prev) => ({
              ...prev,
              [newDoc.name!]: newDoc.notes || "🏍️",
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return emojis;
}
