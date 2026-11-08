import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useLocale } from "@/contexts/LocaleContext";

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  const { locale, setLocale, t } = useLocale();

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      {!compact && (
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("Dil")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {t("Dil tercihi bu cihazda saklanır.")}
          </Text>
        </View>
      )}
      <View style={[styles.options, { backgroundColor: colors.muted }]}>
        {(["tr", "en"] as const).map((option) => {
          const selected = locale === option;
          return (
            <TouchableOpacity
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option === "tr" ? "Türkçe" : "English"}
              testID={`language-${option}`}
              onPress={() => {
                setLocale(option).catch(error => console.warn("[locale] Could not save language preference", error));
              }}
              style={[
                styles.option,
                selected && { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.optionText, { color: selected ? colors.primary : colors.mutedForeground }]}>
                {option === "tr" ? "Türkçe" : "English"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  compact: { minHeight: 36, justifyContent: "flex-end" },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  options: { flexDirection: "row", padding: 3, borderRadius: 11, gap: 2 },
  option: { minWidth: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  optionText: { fontSize: 12, fontFamily: "Inter_700Bold" },
});
