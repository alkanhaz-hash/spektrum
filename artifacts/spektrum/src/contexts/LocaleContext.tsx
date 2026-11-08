import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { normalizeLocale, translate, type Locale } from "@workspace/spektrum-i18n";
import { LocaleContext } from "./LocaleStore";
const STORAGE_KEY = "spektrum:locale";

function initialLocale(): Locale {
  try {
    const saved = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch {
    // Keep Turkish as the default even when browser storage is unavailable.
  }
  return "tr";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === "en"
      ? "SPEKTRUM — Read, write and discover stories"
      : "SPEKTRUM — Türkçe hikayeler yaz, oku ve keşfet";
    const description = locale === "en"
      ? "Read stories, share your writing, and discover new authors on SPEKTRUM."
      : "SPEKTRUM'da hikayeler oku, yazılarını paylaş ve yeni yazarlar keşfet.";
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
      document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", description);
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep the current-session choice even when storage is unavailable.
    }
    setLocaleState(next);
  }, []);
  const value = useMemo(() => ({
    locale,
    setLocale,
    t: (source: string) => translate(locale, source),
  }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}

// Used by the static UI-copy compiler. Non-string values and user content
// are left untouched. The fallback also covers error screens above the provider.
export function useUiTranslation() {
  const context = useContext(LocaleContext);
  const locale = context?.locale ?? "tr";
  return {
    locale,
    ui: <T,>(value: T): T => (typeof value === "string" ? translate(locale, value) : value) as T,
  };
}
