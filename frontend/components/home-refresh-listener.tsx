"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const HOME_REFRESH_KEY = "photoscout-home-refresh";
export const HOME_FLASH_KEY = "photoscout-home-flash";

export function HomeRefreshListener() {
  const router = useRouter();

  useEffect(() => {
    function refreshIfNeeded() {
      if (!window.localStorage.getItem(HOME_REFRESH_KEY)) {
        return;
      }
      window.localStorage.removeItem(HOME_REFRESH_KEY);
      router.refresh();
    }

    refreshIfNeeded();
    window.addEventListener("photoscout-location-created", refreshIfNeeded);
    window.addEventListener("storage", refreshIfNeeded);
    return () => {
      window.removeEventListener("photoscout-location-created", refreshIfNeeded);
      window.removeEventListener("storage", refreshIfNeeded);
    };
  }, [router]);

  return null;
}

export function markHomeForRefresh() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(HOME_REFRESH_KEY, String(Date.now()));
  window.localStorage.setItem(HOME_FLASH_KEY, "New pin added");
  window.dispatchEvent(new Event("photoscout-location-created"));
}
