"use client";
import { useEffect, useState } from "react";
import type { PlatformLocale } from "../lib/platform-i18n";

const supported: PlatformLocale[] = ["pt", "en", "es", "fr", "ru"];

export function usePlatformLocale() {
  // Always "pt" on first render, on both server and client: localStorage is
  // unavailable during SSR, and reading it in this initializer on the client
  // (as earlier code did) made the very first client render disagree with
  // the server-rendered markup, breaking hydration for every page that
  // mounts PlatformLocalizedSurface unconditionally. The effect below reads
  // the real stored locale right after mount instead.
  const [locale, setLocale] = useState<PlatformLocale>(() => "pt");
  useEffect(() => {
    const read = () => {
      const value = localStorage.getItem("ep_locale") as PlatformLocale | null;
      setLocale(value && supported.includes(value) ? value : "pt");
    };
    read();
    window.addEventListener("ep:locale", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("ep:locale", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return locale;
}
