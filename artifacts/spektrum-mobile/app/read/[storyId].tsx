import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getChapter, getChapters, Chapter } from "@/lib/firestore-service";

const { width: SCREEN_W } = Dimensions.get("window");

const FONT_SIZES = [15, 17, 19] as const;
const FONT_LABELS = ["A", "A", "A"];

export default function ReaderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { storyId, chapterId } = useLocalSearchParams<{ storyId: string; chapterId: string }>();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [fontSizeIdx, setFontSizeIdx] = useState(0);
  const [showControls, setShowControls] = useState(true);

  const sid = Array.isArray(storyId) ? storyId[0] : storyId;
  const cid = Array.isArray(chapterId) ? chapterId[0] : chapterId;

  useEffect(() => {
    if (!sid || !cid) return;
    (async () => {
      setLoading(true);
      try {
        const [ch, all] = await Promise.all([
          getChapter(sid, cid),
          getChapters(sid),
        ]);
        setChapter(ch);
        setAllChapters(all);
      } catch { /* sessiz */ }
      finally { setLoading(false); }
    })();
  }, [sid, cid]);

  const currentIdx = allChapters.findIndex((c) => c.id === cid);
  const prevChapter = currentIdx > 0 ? allChapters[currentIdx - 1] : null;
  const nextChapter = currentIdx < allChapters.length - 1 ? allChapters[currentIdx + 1] : null;

  const navigate = (ch: Chapter) => {
    router.replace({ pathname: "/read/[storyId]", params: { storyId: sid, chapterId: ch.id } });
  };

  const fontSize = FONT_SIZES[fontSizeIdx];

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!chapter) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Bölüm bulunamadı.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const paragraphs = chapter.content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      {showControls && (
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 4, backgroundColor: colors.background, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.chapterTitle, { color: colors.foreground }]} numberOfLines={1}>
              {chapter.title}
            </Text>
            {allChapters.length > 0 && (
              <Text style={[styles.chapterMeta, { color: colors.mutedForeground }]}>
                {currentIdx + 1} / {allChapters.length}
              </Text>
            )}
          </View>
          {/* Font size control */}
          <View style={styles.fontControls}>
            {FONT_LABELS.map((label, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setFontSizeIdx(i)}
                style={[
                  styles.fontBtn,
                  fontSizeIdx === i && { backgroundColor: colors.primary + "33" },
                ]}
              >
                <Text
                  style={[
                    styles.fontBtnText,
                    { color: fontSizeIdx === i ? colors.primary : colors.mutedForeground },
                    { fontSize: 11 + i * 2 },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setShowControls(false)}
        onMomentumScrollEnd={() => setShowControls(true)}
      >
        <Text style={[styles.chapterHeading, { color: colors.foreground }]}>{chapter.title}</Text>
        {paragraphs.map((p, i) => (
          <Text
            key={i}
            style={[
              styles.paragraph,
              {
                color: colors.foreground,
                fontSize,
                lineHeight: fontSize * 1.85,
              },
            ]}
          >
            {p}
          </Text>
        ))}
        {paragraphs.length === 0 && (
          <Text style={[styles.emptyContent, { color: colors.mutedForeground }]}>
            Bu bölümde içerik bulunmuyor.
          </Text>
        )}

        {/* Chapter navigation */}
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[
              styles.navBtn,
              { borderColor: colors.border, opacity: prevChapter ? 1 : 0.3 },
            ]}
            onPress={() => prevChapter && navigate(prevChapter)}
            disabled={!prevChapter}
          >
            <Feather name="chevron-left" size={18} color={colors.foreground} />
            <Text style={[styles.navBtnText, { color: colors.foreground }]}>Önceki</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.navBtn,
              styles.navBtnNext,
              { backgroundColor: nextChapter ? colors.primary : colors.muted, opacity: nextChapter ? 1 : 0.5 },
            ]}
            onPress={() => nextChapter && navigate(nextChapter)}
            disabled={!nextChapter}
          >
            <Text style={[styles.navBtnText, { color: nextChapter ? "#fff" : colors.mutedForeground }]}>
              Sonraki
            </Text>
            <Feather name="chevron-right" size={18} color={nextChapter ? "#fff" : colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerBtn: { padding: 6 },
  headerCenter: { flex: 1 },
  chapterTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  chapterMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  fontControls: { flexDirection: "row", gap: 2 },
  fontBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fontBtnText: { fontFamily: "Inter_700Bold" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 24, gap: 16 },
  chapterHeading: { fontSize: 22, fontFamily: "Inter_700Bold", lineHeight: 30, marginBottom: 8 },
  paragraph: { fontFamily: "Inter_400Regular" },
  emptyContent: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", paddingTop: 40 },
  navRow: { flexDirection: "row", gap: 12, marginTop: 32 },
  navBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  navBtnNext: { borderWidth: 0 },
  navBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
