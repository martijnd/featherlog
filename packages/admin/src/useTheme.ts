import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  applyResolvedTheme,
  getStoredPreference,
  readChartColors,
  resolveTheme,
  setStoredPreference,
  subscribeSystemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

function subscribePreference(onStoreChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === "featherlog-theme") onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("featherlog-theme-change", onStoreChange);
  const unsubSystem = subscribeSystemTheme(onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("featherlog-theme-change", onStoreChange);
    unsubSystem();
  };
}

function getPreferenceSnapshot(): ThemePreference {
  return getStoredPreference();
}

function getResolvedSnapshot(): ResolvedTheme {
  return resolveTheme(getStoredPreference());
}

function notifyThemeChange() {
  window.dispatchEvent(new Event("featherlog-theme-change"));
}

export function useTheme() {
  const preference = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    () => "system" as ThemePreference
  );
  const resolved = useSyncExternalStore(
    subscribePreference,
    getResolvedSnapshot,
    () => "light" as ResolvedTheme
  );

  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setStoredPreference(next);
    applyResolvedTheme(resolveTheme(next));
    notifyThemeChange();
  }, []);

  const cyclePreference = useCallback(() => {
    const order: ThemePreference[] = ["system", "light", "dark"];
    const idx = order.indexOf(preference);
    const next = order[(idx + 1) % order.length];
    setPreference(next);
  }, [preference, setPreference]);

  return {
    preference,
    resolved,
    setPreference,
    cyclePreference,
    isSystem: preference === "system",
  };
}

/** Re-read CSS chart variables when theme changes (for Recharts). */
export function useChartColors() {
  const resolved = useSyncExternalStore(
    subscribePreference,
    getResolvedSnapshot,
    () => "light" as ResolvedTheme
  );
  const [, setTick] = useState(0);
  useEffect(() => {
    setTick((t) => t + 1);
  }, [resolved]);
  return readChartColors();
}
