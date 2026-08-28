"use client";
import { useEffect, useState } from "react";
import type { PlatformLocale } from "../lib/platform-i18n";

const supported: PlatformLocale[] = ["pt", "en", "es", "fr", "ru"];

export function usePlatformLocale() {
  const [locale, setLocale] = useState<PlatformLocale>("pt");
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
