import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { normalizeLocale, translate, type Locale } from "@workspace/spektrum-i18n";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (source: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = "spektrum:locale";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("tr");
  const choiceChanged = useRef(false);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(value => {
      const saved = normalizeLocale(value);
      if (active && saved && !choiceChanged.current) setLocaleState(saved);
    }).catch(error => {
      console.warn("[locale] Could not load saved language preference", error);
    });
    return () => { active = false; };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    choiceChanged.current = true;
    setLocaleState(next);
    const save = saveQueue.current.catch(() => {}).then(() => AsyncStorage.setItem(STORAGE_KEY, next));
    saveQueue.current = save;
    await save;
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

export function useUiTranslation() {
  const context = useContext(LocaleContext);
  const locale = context?.locale ?? "tr";
  return {
    locale,
    ui: <T,>(value: T): T => (typeof value === "string" ? translate(locale, value) : value) as T,
  };
}
