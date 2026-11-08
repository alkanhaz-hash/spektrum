import colors from "@/constants/colors";

/**
 * SPEKTRUM her zaman LIGHT mode kullanir.
 * Web sitesi aydinlik tema, mobile de ayni.
 */
export function useColors() {
  const palette = colors.light;
  return { ...palette, radius: colors.radius };
}
