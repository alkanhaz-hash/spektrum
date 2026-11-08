import { createContext } from "react";
import type { Locale } from "@workspace/spektrum-i18n";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (source: string) => string;
};

// Keep context identity separate from translation data and Fast Refresh hooks.
export const LocaleContext = createContext<LocaleContextValue | null>(null);
