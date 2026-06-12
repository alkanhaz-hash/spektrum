import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import {
  getChapter,
  getChapters,
  getInlineComments,
  addInlineComment,
  likeInlineComment,
  Chapter,
  InlineComment,
} from "@/lib/firestore-service";

const { width: SCREEN_W } = Dimensions.get("window");
const FONT_SIZES = [15, 17, 19] as const;

// ─── Yorum modalı ─────────────────────────────────────────────────────────────

interface CommentSheetProps {
  storyId: string;
  chapterId: string;
  paragraphIndex: number;
  paragraphAnchor: string;
  paragraphPreview: string;
  allComments: InlineComment[];
  onClose: () => void;
  onCommentAdded: (c: InlineComment) => void;
  onLikeToggled: (commentId: string, liked: boolean) => void;
}

function CommentSheet({
  storyId,
  chapterId,
  paragraphIndex,
  paragraphAnchor,
  paragraphPreview,
  allComments,
  onClose,
  onCommentAdded,
  onLikeToggled,
}: CommentSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const threadComments = allComments.filter((c) =>
    c.paragraphAnchor
      ? c.paragraphAnchor === paragraphAnchor
      : c.paragraphIndex === paragraphIndex
  );

  const handleSubmit = async () => {
    if (!text.trim() || submitting || !user || !profile) return;
    setSubmitting(true);
    try {
      const id = await addInlineComment({
        storyId,
        chapterId,
        paragraphIndex,
        paragraphAnchor,
        authorId: user.uid,
        authorName: profile.displayName,
        authorAvatar: profile.avatarUrl ?? "",
        text: text.trim(),
      });
      const newComment: InlineComment = {
        id,
        storyId,
        chapterId,
        paragraphIndex,
        paragraphAnchor,
        authorId: user.uid,
        authorName: profile.displayName,
        authorAvatar: profile.avatarUrl ?? "",
        text: text.trim(),
        likeCount: 0,
        likedBy: [],
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
      };
      onCommentAdded(newComment);
      setText("");
    } catch {
      // sessiz
    } finally {
      setSubmitting(false);
    }
  };

  function timeAgo(ts: { seconds: number }): string {
    const diff = Math.floor(Date.now() / 1000 - (ts?.seconds ?? 0));
    if (diff < 60) return "az önce";
    if (diff < 3600) return `${Math.floor(diff / 60)} dk`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} sa`;
    return `${Math.floor(diff / 86400)} gün`;
  }

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={cs.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[cs.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 }]}
      >
        {/* Tutaç */}
        <View style={cs.handle} />

        {/* Başlık */}
        <View style={[cs.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={cs.sheetHeaderLeft}>
            <Text style={[cs.sheetTitle, { color: colors.primary }]}>Satır Arası Yorumlar</Text>
            <Text style={[cs.sheetSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              "{paragraphPreview}"
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Yorumlar listesi */}
        <FlatList
          data={threadComments}
          keyExtractor={(c) => c.id}
          style={cs.commentList}
          contentContainerStyle={{ paddingVertical: 12, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={[cs.emptyText, { color: colors.mutedForeground }]}>
              İlk yorumu sen yap!
            </Text>
          }
          renderItem={({ item: c }) => {
            const liked = user ? c.likedBy.includes(user.uid) : false;
            return (
              <View style={[cs.commentRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={[cs.commentAvatar, { backgroundColor: colors.primary + "22" }]}>
                  <Text style={[cs.commentAvatarText, { color: colors.primary }]}>
                    {c.authorName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={cs.commentBody}>
                  <View style={cs.commentMeta}>
                    <Text style={[cs.commentAuthor, { color: colors.foreground }]}>{c.authorName}</Text>
                    <Text style={[cs.commentTime, { color: colors.mutedForeground }]}>{timeAgo(c.createdAt)}</Text>
                  </View>
                  <Text style={[cs.commentText, { color: colors.foreground }]}>{c.text}</Text>
                  <TouchableOpacity
                    onPress={() => user && onLikeToggled(c.id, !liked)}
                    style={cs.likeBtn}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name="heart"
                      size={13}
                      color={liked ? "#ec4899" : colors.mutedForeground}
                    />
                    {c.likeCount > 0 && (
                      <Text style={[cs.likeCount, { color: liked ? "#ec4899" : colors.mutedForeground }]}>
                        {c.likeCount}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />

        {/* Giriş alanı */}
        {user ? (
          <View style={[cs.inputRow, { borderTopColor: colors.border }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Yorumunu yaz…"
              placeholderTextColor={colors.mutedForeground}
              style={[cs.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              multiline
              maxLength={500}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={handleSubmit}
            />
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!text.trim() || submitting}
              style={[cs.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.muted }]}
              activeOpacity={0.8}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="send" size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => { onClose(); router.push("/auth"); }}
            style={[cs.loginPrompt, { borderTopColor: colors.border }]}
          >
            <Text style={[cs.loginPromptText, { color: colors.primary }]}>
              Yorum yapmak için giriş yap →
            </Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Ana ekran ────────────────────────────────────────────────────────────────

export default function ReaderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { storyId, chapterId } = useLocalSearchParams<{ storyId: string; chapterId: string }>();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [fontSizeIdx, setFontSizeIdx] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [comments, setComments] = useState<InlineComment[]>([]);
  const [selectedPara, setSelectedPara] = useState<{
    index: number;
    anchor: string;
    preview: string;
  } | null>(null);

  const sid = Array.isArray(storyId) ? storyId[0] : storyId;
  const cid = Array.isArray(chapterId) ? chapterId[0] : chapterId;

  useEffect(() => {
    if (!sid || !cid) return;
    setLoading(true);
    Promise.all([getChapter(cid), getChapters(sid), getInlineComments(cid)])
      .then(([ch, all, cms]) => {
        setChapter(ch);
        setAllChapters(all);
        setComments(cms);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sid, cid]);

  const currentIdx = allChapters.findIndex((c) => c.id === cid);
  const prevChapter = currentIdx > 0 ? allChapters[currentIdx - 1] : null;
  const nextChapter = currentIdx < allChapters.length - 1 ? allChapters[currentIdx + 1] : null;

  const navigate = (ch: Chapter) => {
    setSelectedPara(null);
    router.replace({ pathname: "/read/[storyId]", params: { storyId: sid, chapterId: ch.id } });
  };

  const handleCommentAdded = useCallback((c: InlineComment) => {
    setComments((prev) => [...prev, c]);
  }, []);

  const handleLikeToggled = useCallback(async (commentId: string, liked: boolean) => {
    if (!user) return;
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              likeCount: c.likeCount + (liked ? 1 : -1),
              likedBy: liked
                ? [...c.likedBy, user.uid]
                : c.likedBy.filter((id) => id !== user.uid),
            }
          : c
      )
    );
    try { await likeInlineComment(commentId, user.uid, liked); } catch { /* sessiz */ }
  }, [user]);

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

  function commentCountForParagraph(index: number, anchor: string): number {
    return comments.filter((c) =>
      c.paragraphAnchor ? c.paragraphAnchor === anchor : c.paragraphIndex === index
    ).length;
  }

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
          <View style={styles.fontControls}>
            {FONT_SIZES.map((size, i) => (
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
                  A
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

        {/* Yorum ipucu — ilk kez görüyorsa */}
        <View style={[styles.tipRow, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "25" }]}>
          <Feather name="message-circle" size={13} color={colors.primary} />
          <Text style={[styles.tipText, { color: colors.primary }]}>
            Bir paragrafa dokun → satır arası yorum bırak
          </Text>
        </View>

        {paragraphs.map((p, i) => {
          const anchor = p.slice(0, 60);
          const count = commentCountForParagraph(i, anchor);
          return (
            <TouchableOpacity
              key={i}
              onPress={() => setSelectedPara({ index: i, anchor, preview: p.slice(0, 60) })}
              activeOpacity={0.75}
              style={styles.paraWrap}
            >
              <Text
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
              {count > 0 && (
                <View style={[styles.commentBubble, { backgroundColor: colors.primary }]}>
                  <Feather name="message-circle" size={11} color="#fff" />
                  <Text style={styles.commentBubbleText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {paragraphs.length === 0 && (
          <Text style={[styles.emptyContent, { color: colors.mutedForeground }]}>
            Bu bölümde içerik bulunmuyor.
          </Text>
        )}

        {/* Toplam yorum sayısı */}
        {comments.length > 0 && (
          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Feather name="message-circle" size={14} color={colors.mutedForeground} />
            <Text style={[styles.totalText, { color: colors.mutedForeground }]}>
              Bu bölümde {comments.length} satır arası yorum var
            </Text>
          </View>
        )}

        {/* Bölüm navigasyonu */}
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, { borderColor: colors.border, opacity: prevChapter ? 1 : 0.3 }]}
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

      {/* Yorum modal */}
      {selectedPara && chapter && (
        <CommentSheet
          storyId={sid}
          chapterId={cid}
          paragraphIndex={selectedPara.index}
          paragraphAnchor={selectedPara.anchor}
          paragraphPreview={selectedPara.preview}
          allComments={comments}
          onClose={() => setSelectedPara(null)}
          onCommentAdded={handleCommentAdded}
          onLikeToggled={handleLikeToggled}
        />
      )}
    </View>
  );
}

// ─── Stiller ─────────────────────────────────────────────────────────────────

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
  chapterHeading: { fontSize: 22, fontFamily: "Inter_700Bold", lineHeight: 30, marginBottom: 4 },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  tipText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  paraWrap: { position: "relative" },
  paragraph: { fontFamily: "Inter_400Regular" },
  commentBubble: {
    position: "absolute",
    top: 0,
    right: -4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
  },
  commentBubbleText: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 1,
  },
  totalText: { fontSize: 13, fontFamily: "Inter_400Regular" },
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

const cs = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(150,150,180,0.4)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  sheetHeaderLeft: { flex: 1 },
  sheetTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sheetSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  commentList: { flexGrow: 0, maxHeight: 300, paddingHorizontal: 14 },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  commentAvatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  commentBody: { flex: 1, gap: 4 },
  commentMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  commentAuthor: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  commentTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  commentText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  likeCount: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyText: { textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 14, paddingVertical: 24 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  loginPrompt: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    alignItems: "center",
  },
  loginPromptText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
