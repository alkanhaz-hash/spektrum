import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useColors } from "@/hooks/useColors";

const STORAGE_KEY = "spektrum:first-run-tour:complete";

const COPY = {
  tr: {
    eyebrow: "SPEKTRUM'A HOŞ GELDİN",
    skip: "Turu geç",
    continue: "Devam et",
    finish: "Keşfetmeye başla",
    stepLabel: (step: number) => `ADIM ${step} / 3`,
    steps: [
      {
        title: "Sana göre hikâyeler keşfet.",
        body: "Keşfet'te türlere göz at, yeni yazarlarla tanış ve sıradaki favori hikâyeni bul.",
        visualLabel: "KEŞFET",
        visualTitle: "Yeni dünyalara açıl",
        visualCaption: "Her hikâye başka bir başlangıç.",
        icon: "compass" as const,
      },
      {
        title: "Her paragrafta sohbete katıl.",
        body: "Okurken bir paragrafın altına düşünceni bırak. Yazarla ve diğer okurlarla aynı hikâyede buluş.",
        visualLabel: "OKUMA NOTU",
        visualTitle: "“Bu cümle içimde kaldı.”",
        visualCaption: "Paragrafa yorum ekle",
        icon: "message-circle" as const,
      },
      {
        title: "Kendi hikâyeni paylaş.",
        body: "Yaz bölümünde hikâyeni oluştur, bölümlerini düzenle ve Spektrum topluluğuyla buluştur.",
        visualLabel: "YAZI MASASI",
        visualTitle: "Anlatılmayı bekleyen bir hikâye var.",
        visualCaption: "İlk satır senden.",
        icon: "edit-2" as const,
      },
    ],
  },
  en: {
    eyebrow: "WELCOME TO SPEKTRUM",
    skip: "Skip tour",
    continue: "Continue",
    finish: "Start exploring",
    stepLabel: (step: number) => `STEP ${step} / 3`,
    steps: [
      {
        title: "Find stories that feel like yours.",
        body: "Browse genres in Discover, meet new authors, and find the story you will want to stay with.",
        visualLabel: "DISCOVER",
        visualTitle: "Open a door to somewhere new",
        visualCaption: "Every story is a different beginning.",
        icon: "compass" as const,
      },
      {
        title: "Join the conversation, paragraph by paragraph.",
        body: "Leave a thought beneath a paragraph as you read. Meet the author and other readers inside the story.",
        visualLabel: "READING NOTE",
        visualTitle: "“That line stayed with me.”",
        visualCaption: "Add a paragraph comment",
        icon: "message-circle" as const,
      },
      {
        title: "Put your own story into words.",
        body: "Create a story in Write, shape its chapters, and share it with the Spektrum community.",
        visualLabel: "WRITING DESK",
        visualTitle: "There is a story waiting to be told.",
        visualCaption: "The first line is yours.",
        icon: "edit-2" as const,
      },
    ],
  },
} as const;

export default function FirstRunTour() {
  const colors = useColors();
  const { locale } = useLocale();
  const { user, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [step, setStep] = useState(0);
  const completing = useRef(false);
  const copy = locale === "en" ? COPY.en : COPY.tr;
  const current = copy.steps[step];

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (active) {
          setCompleted(value === "true");
          setReady(true);
        }
      })
      .catch((error) => {
        console.warn("[tour] Could not load first-run tour preference", error);
        if (active) {
          setCompleted(false);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const completeTour = async () => {
    if (completing.current) return;
    completing.current = true;
    setCompleted(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, "true");
    } catch (error) {
      console.warn("[tour] Could not save first-run tour preference", error);
    }
  };

  useEffect(() => {
    if (!ready || authLoading || !user || completed) return;
    setCompleted(true);
    AsyncStorage.setItem(STORAGE_KEY, "true").catch((error) => {
      console.warn("[tour] Could not save existing-user preference", error);
    });
  }, [authLoading, completed, ready, user]);

  const advance = () => {
    if (step < copy.steps.length - 1) {
      setStep((currentStep) => currentStep + 1);
    } else {
      void completeTour();
    }
  };

  return (
    <Modal
      visible={ready && !authLoading && !user && !completed}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => void completeTour()}
    >
      <View
        style={[
          styles.scrim,
          {
            paddingTop: Math.max(insets.top, 16) + 12,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          },
        ]}
      >
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.topline}>
            <View style={styles.brand}>
              <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
                <View style={styles.markLine} />
                <View style={styles.markLineShort} />
              </View>
              <Text style={[styles.brandName, { color: colors.foreground }]}>SPEKTRUM</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.skip}
              onPress={() => void completeTour()}
              hitSlop={10}
              style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
            >
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>{copy.skip}</Text>
            </Pressable>
          </View>

          <View
            accessibilityRole="progressbar"
            accessibilityLabel={copy.stepLabel(step + 1)}
            accessibilityValue={{ min: 1, max: 3, now: step + 1 }}
            style={styles.progressTrack}
          >
            {copy.steps.map((item, index) => (
              <View
                key={item.visualLabel}
                style={[
                  styles.progressSegment,
                  { backgroundColor: index <= step ? colors.primary : colors.border },
                ]}
              />
            ))}
          </View>

          <View
            style={[
              styles.illustration,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
            accessible
            accessibilityLabel={`${current.visualLabel}. ${current.visualTitle}`}
          >
            <View style={styles.illustrationTop}>
              <View style={[styles.iconTile, { backgroundColor: colors.primary + "1A" }]}>
                <Feather name={current.icon} size={20} color={colors.primary} />
              </View>
              <Text style={[styles.visualEyebrow, { color: colors.mutedForeground }]}>
                {current.visualLabel}
              </Text>
              <View style={[styles.visualRule, { backgroundColor: colors.border }]} />
            </View>
            <Text style={[styles.visualTitle, { color: colors.foreground }]}>
              {current.visualTitle}
            </Text>
            <View style={styles.visualBottom}>
              <View style={[styles.visualAccent, { backgroundColor: colors.secondary }]} />
              <Text style={[styles.visualCaption, { color: colors.mutedForeground }]}>
                {current.visualCaption}
              </Text>
              {step === 1 ? (
                <View style={[styles.commentMark, { borderColor: colors.primary }]}>
                  <Feather name="message-square" size={13} color={colors.primary} />
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.copyBlock}>
            <Text style={[styles.stepLabel, { color: colors.primary }]}>{copy.stepLabel(step + 1)}</Text>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.foreground }]}
            >
              {current.title}
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{current.body}</Text>
          </View>

          <View style={styles.footer}>
            <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {copy.steps.map((item, index) => (
                <View
                  key={item.visualLabel}
                  style={[
                    styles.dot,
                    {
                      width: index === step ? 22 : 6,
                      backgroundColor: index === step ? colors.primary : colors.border,
                    },
                  ]}
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={step === 2 ? copy.finish : copy.continue}
              onPress={advance}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                {step === 2 ? copy.finish : copy.continue}
              </Text>
              <Feather
                name={step === 2 ? "arrow-right" : "chevron-right"}
                size={17}
                color={colors.primaryForeground}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(18, 17, 28, 0.72)",
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    shadowColor: "#080711",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 30,
    elevation: 12,
  },
  topline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: {
    width: 25,
    height: 25,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    transform: [{ rotate: "-8deg" }],
  },
  markLine: { width: 12, height: 2, borderRadius: 2, backgroundColor: "#FFFFFF" },
  markLineShort: { width: 8, height: 2, borderRadius: 2, backgroundColor: "#FFFFFF" },
  brandName: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 2.1 },
  skipButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 4 },
  skipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  progressTrack: { flexDirection: "row", gap: 5, marginTop: 19, marginBottom: 18 },
  progressSegment: { height: 3, flex: 1, borderRadius: 3 },
  illustration: {
    minHeight: 158,
    borderWidth: 1,
    borderRadius: 19,
    paddingHorizontal: 17,
    paddingVertical: 15,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  illustrationTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  iconTile: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  visualEyebrow: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  visualRule: { height: 1, flex: 1, marginLeft: 3 },
  visualTitle: {
    maxWidth: 310,
    fontSize: 23,
    lineHeight: 30,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.55,
  },
  visualBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  visualAccent: { width: 16, height: 2, borderRadius: 2 },
  visualCaption: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  commentMark: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  copyBlock: { paddingTop: 20, paddingBottom: 19 },
  stepLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 8 },
  title: { fontSize: 24, lineHeight: 31, fontFamily: "Inter_700Bold", letterSpacing: -0.65 },
  body: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular", marginTop: 8 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  dots: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 2 },
  dot: { height: 6, borderRadius: 4 },
  primaryButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 18,
    borderRadius: 15,
  },
  primaryButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
