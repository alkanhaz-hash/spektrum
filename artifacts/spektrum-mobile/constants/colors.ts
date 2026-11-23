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
    text: "#EDE9E3",
    tint: "#9A7CDE",
    background: "#11131D",
    foreground: "#EDE9E3",
    card: "#171A27",
    cardForeground: "#EDE9E3",
    primary: "#9A7CDE",
    primaryForeground: "#FFFFFF",
    secondary: "#E7A240",
    secondaryForeground: "#11131D",
    muted: "#242838",
    mutedForeground: "#8B94A7",
    accent: "#242838",
    accentForeground: "#EDE9E3",
    destructive: "#E14747",
    destructiveForeground: "#FFFFFF",
    border: "#292D3D",
    input: "#212536",
  },
  radius: 12,
} as const;

export default colors;
