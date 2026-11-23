import colors from "@/constants/colors";
import { useThemeMode } from "@/contexts/ThemeContext";

export function useColors() {
  const { mode } = useThemeMode();
  const palette = colors[mode];
  return { ...palette, radius: colors.radius };
}
