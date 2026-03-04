import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Triggers a subtle tactile vibration on supported mobile devices
 * to emulate iOS haptic feedback.
 */
export function haptic(duration: number = 50) {
  if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
    window.navigator.vibrate(duration);
  }
}
