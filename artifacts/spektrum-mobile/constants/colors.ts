/**
 * SPEKTRUM Light Mode — Web sitesi ile ayni tema
 *
 * Web: Aydinlik, temiz, beyaz arka plan
 * Primary: canli mor (#7C3AED)
 * Secondary: siyan (#0EA5C9)
 * Arka plan: beyaz (#FFFFFF)
 * Kart: beyaz (#FFFFFF)
 */
const colors = {
  light: {
    text: "#14141A",
    tint: "#7C3AED",
    background: "#FFFFFF",
    foreground: "#14141A",
    card: "#FFFFFF",
    cardForeground: "#14141A",
    primary: "#7C3AED",
    primaryForeground: "#FFFFFF",
    secondary: "#0EA5C9",
    secondaryForeground: "#FFFFFF",
    muted: "#F1F5F9",
    mutedForeground: "#64748B",
    accent: "#F1F5F9",
    accentForeground: "#14141A",
    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",
    border: "#E2E8F0",
    input: "#F1F5F9",
  },
  dark: {
    /* Web sitesi light ile ayni — mobile light only */
    text: "#14141A",
    tint: "#7C3AED",
    background: "#FFFFFF",
    foreground: "#14141A",
    card: "#FFFFFF",
    cardForeground: "#14141A",
    primary: "#7C3AED",
    primaryForeground: "#FFFFFF",
    secondary: "#0EA5C9",
    secondaryForeground: "#FFFFFF",
    muted: "#F1F5F9",
    mutedForeground: "#64748B",
    accent: "#F1F5F9",
    accentForeground: "#14141A",
    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",
    border: "#E2E8F0",
    input: "#F1F5F9",
  },
  radius: 12,
} as const;

export default colors;
