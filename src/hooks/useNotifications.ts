import { useState, useEffect, useCallback } from "react";

export interface AppNotification {
  id: string;
  type: "success" | "warning" | "info" | "error";
  title: string;
  message: string;
  timestamp: number;
}

const STORAGE_KEY = "@isync_notifications";

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const loadNotifications = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: AppNotification[] = JSON.parse(stored);
        // keep only last 7 days
        const limit = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const valid = parsed.filter(n => n.timestamp > limit);
        setNotifications(valid);
        if (valid.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        }
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    loadNotifications();
    const handleStorage = () => loadNotifications();
    window.addEventListener("isync_notification", handleStorage);
    return () => window.removeEventListener("isync_notification", handleStorage);
  }, [loadNotifications]);

  const addNotification = useCallback((type: AppNotification["type"], title: string, message: string) => {
    const newNotif: AppNotification = { id: Math.random().toString(36).substring(2, 9), type, title, message, timestamp: Date.now() };
    setNotifications(prev => {
      const updated = [newNotif, ...prev];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event("isync_notification"));
      return updated;
    });

    // Trigger system native notification
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, {
        body: message,
        icon: "/favicon.ico",
        requireInteraction: false
      });
      n.onclick = () => { window.focus(); n.close(); };
    }
  }, []);

  const clearNotifications = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setNotifications([]);
    window.dispatchEvent(new Event("routeos_notification"));
  }, []);

  return { notifications, addNotification, clearNotifications };
}
