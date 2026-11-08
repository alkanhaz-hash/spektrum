import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import {
  getActiveStatuses,
  createStatus,
  markStatusViewed,
  deleteStatus,
  getFollowing,
  UserStatus,
} from "@/lib/firestore-service";
import { uploadStatusImage } from "@/lib/storage-service";

const TEXT_COLORS = [
  "#A07FE6", "#E6A545", "#ec4899", "#10b981",
  "#f59e0b", "#ef4444", "#8b5cf6", "#3b82f6",
];

interface MobileStatusGroup {
  uid: string;
  latest: UserStatus;
  statuses: UserStatus[];
  hasUnviewed: boolean;
}

// ─── Durum dairesi ────────────────────────────────────────────────────────────

function StatusAvatar({
  group,
  isOwn,
  userId,
  onPress,
}: {
  group: MobileStatusGroup;
  isOwn: boolean;
  userId?: string;
  onPress: (group: MobileStatusGroup) => void;
}) {
  const colors = useColors();
  const status = group.latest;
  const viewed = userId ? !group.hasUnviewed : false;

  return (
    <TouchableOpacity
      style={styles.statusItem}
      onPress={() => onPress(group)}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.ringOuter,
          viewed
            ? { borderColor: colors.border }
            : { borderColor: colors.primary },
          isOwn && { borderColor: "#E6A545" },
        ]}
      >
        <View style={[styles.ringInner, { backgroundColor: colors.background }]}>
          {status.type === "image" && status.mediaUrl ? (
            <Image source={{ uri: status.mediaUrl }} style={styles.statusAvatar} />
          ) : (
            <View
              style={[
                styles.statusAvatar,
                { backgroundColor: status.backgroundColor ?? colors.muted, alignItems: "center", justifyContent: "center" },
              ]}
            >
              <Text style={[styles.statusAvatarInitial, { color: "#fff" }]}>
                {status.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.statusName, { color: colors.foreground }]} numberOfLines={1}>
        {isOwn ? "Durumun" : status.displayName.split(" ")[0]}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export default function MobileStatusBar() {
  const colors = useColors();
  const { user, profile, loading: authLoading } = useAuth();
  const [statuses, setStatuses] = useState<UserStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewedStatus, setViewedStatus] = useState<UserStatus | null>(null);
  const [viewedGroup, setViewedGroup] = useState<MobileStatusGroup | null>(null);
  const [viewedIndex, setViewedIndex] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  const [createType, setCreateType] = useState<"text" | "image">("text");
  const [createText, setCreateText] = useState("");
  const [createBg, setCreateBg] = useState(TEXT_COLORS[0]);
  const [createImageUri, setCreateImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createImageDataUrl, setCreateImageDataUrl] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setStatuses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [data, following] = await Promise.all([
        getActiveStatuses(),
        getFollowing(user.uid),
      ]);
      setStatuses(data);
      setFollowingIds(new Set(following.map(person => person.uid)));
    } catch (error) {
      console.error("[MobileStatusBar] Durumlar yüklenemedi:", error);
      setStatuses([]);
    }
    finally { setLoading(false); }
  }, [authLoading, user?.uid]);

  useEffect(() => { load(); }, [load]);

  const statusGroups = useMemo(() => {
    const groups = new Map<string, MobileStatusGroup>();
    for (const status of statuses) {
      const existing = groups.get(status.uid);
      if (existing) {
        existing.statuses.push(status);
        if ((status.createdAt?.seconds ?? 0) > (existing.latest.createdAt?.seconds ?? 0)) {
          existing.latest = status;
        }
        if (!status.viewedBy.includes(user?.uid ?? "")) existing.hasUnviewed = true;
      } else {
        groups.set(status.uid, {
          uid: status.uid,
          latest: status,
          statuses: [status],
          hasUnviewed: !status.viewedBy.includes(user?.uid ?? ""),
        });
      }
    }
    for (const group of groups.values()) {
      group.statuses.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
    }
    return groups;
  }, [statuses, user?.uid]);

  const ownGroup = user ? statusGroups.get(user.uid) ?? null : null;
  const othersGroups = useMemo(() => {
    return Array.from(statusGroups.values()).filter(group => group.uid !== user?.uid).sort((a, b) => {
      const followDifference = Number(followingIds.has(b.uid)) - Number(followingIds.has(a.uid));
      if (followDifference !== 0) return followDifference;
      if (a.hasUnviewed !== b.hasUnviewed) return Number(b.hasUnviewed) - Number(a.hasUnviewed);
      return (b.latest.createdAt?.seconds ?? 0) - (a.latest.createdAt?.seconds ?? 0);
    });
  }, [statusGroups, user?.uid, followingIds]);

  const showStatus = async (group: MobileStatusGroup, index: number) => {
    const s = group.statuses[index];
    setViewedGroup(group);
    setViewedIndex(index);
    setViewedStatus(s);
    if (user && !s.viewedBy.includes(user.uid)) {
      try {
        await markStatusViewed(s.id, user.uid);
        setStatuses((prev) =>
          prev.map((x) => x.id === s.id ? { ...x, viewedBy: [...x.viewedBy, user.uid] } : x)
        );
      } catch (error) {
        console.error("[MobileStatusBar] Görüntüleme kaydedilemedi:", error);
      }
    }
  };

  const handleOpenStatus = (group: MobileStatusGroup) => {
    const firstUnviewed = user
      ? group.statuses.findIndex(status => !status.viewedBy.includes(user.uid))
      : -1;
    void showStatus(group, firstUnviewed >= 0 ? firstUnviewed : 0);
  };

  const closeViewer = () => {
    setViewedStatus(null);
    setViewedGroup(null);
    setViewedIndex(0);
  };

  const goPreviousStatus = () => {
    if (viewedGroup && viewedIndex > 0) void showStatus(viewedGroup, viewedIndex - 1);
  };

  const goNextStatus = () => {
    if (!viewedGroup) return;
    if (viewedIndex < viewedGroup.statuses.length - 1) {
      void showStatus(viewedGroup, viewedIndex + 1);
    } else {
      closeViewer();
    }
  };

  const handlePickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("İzin gerekli", "Fotoğraf seçmek için galeri izni gerekiyor.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.55,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setCreateImageUri(result.assets[0].uri);
      setCreateImageDataUrl(
        result.assets[0].base64
          ? `data:${result.assets[0].mimeType ?? "image/jpeg"};base64,${result.assets[0].base64}`
          : null
      );
      setCreateType("image");
    }
  };

  const handleCreate = async () => {
    if (!user || !profile) return;
    if (createType === "text" && !createText.trim()) return;
    if (createType === "image" && !createImageUri) return;

    setSubmitting(true);
    try {
      let mediaUrl: string | undefined;
      if (createType === "image" && createImageUri) {
        try {
          mediaUrl = await uploadStatusImage(user.uid, createImageUri);
        } catch (uploadError) {
          console.warn("[MobileStatusBar] Storage yüklemesi başarısız, yerel görsel verisi kullanılıyor:", uploadError);
          if (!createImageDataUrl || createImageDataUrl.length > 850_000) {
            throw new Error("Fotoğraf yüklenemedi. Daha küçük bir fotoğraf seç.");
          }
          mediaUrl = createImageDataUrl;
        }
      }
      await createStatus(user.uid, {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? "",
        type: createType,
        text: createType === "text" ? createText.trim() : undefined,
        backgroundColor: createType === "text" ? createBg : undefined,
        mediaUrl,
      });
      setCreateText("");
      setCreateImageUri(null);
      setCreateImageDataUrl(null);
      setCreateBg(TEXT_COLORS[0]);
      setCreateType("text");
      setShowCreate(false);
      await load();
    } catch (error) {
      Alert.alert("Hata", error instanceof Error ? error.message : "Durum paylaşılamadı.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOwn = async () => {
    if (!ownGroup) return;
    const ownStatus = ownGroup.statuses[ownGroup.statuses.length - 1];
    Alert.alert("Durumu sil", "24h durumunu silmek istiyor musun?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
            try {
              await deleteStatus(ownStatus.id);
              setStatuses((prev) => prev.filter((s) => s.id !== ownStatus.id));
            } catch {
              Alert.alert("Hata", "Durum silinemedi.");
            }
        },
      },
    ]);
  };

  if (!user) return null;

  return (
    <>
      <View style={[styles.bar, { borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.barScroll}
        >
          {/* + Ekle / Kendi durumu */}
          {ownGroup ? (
              <TouchableOpacity
                style={styles.statusItem}
                onPress={() => handleOpenStatus(ownGroup)}
                onLongPress={handleDeleteOwn}
                activeOpacity={0.8}
              >
                <View style={[styles.ringOuter, { borderColor: "#E6A545" }]}>
                  <View style={[styles.ringInner, { backgroundColor: colors.background }]}>
                    {ownGroup.latest.type === "image" && ownGroup.latest.mediaUrl ? (
                      <Image source={{ uri: ownGroup.latest.mediaUrl }} style={styles.statusAvatar} />
                    ) : (
                      <View style={[styles.statusAvatar, { backgroundColor: ownGroup.latest.backgroundColor ?? colors.primary, alignItems: "center", justifyContent: "center" }]}>
                        <Text style={[styles.statusAvatarInitial, { color: "#fff" }]}>
                          {ownGroup.latest.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={[styles.statusName, { color: colors.foreground }]}>Durumun</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.statusItem}
                onPress={() => setShowCreate(true)}
                activeOpacity={0.8}
              >
                <View style={[styles.ringOuter, { borderColor: colors.border, borderStyle: "dashed" }]}>
                  <View style={[styles.ringInner, { backgroundColor: colors.muted }]}>
                    <View style={styles.addBtn}>
                      <Feather name="plus" size={22} color={colors.primary} />
                    </View>
                  </View>
                </View>
                <Text style={[styles.statusName, { color: colors.mutedForeground }]}>Durum Ekle</Text>
              </TouchableOpacity>
            )}

          {ownGroup && (
            <TouchableOpacity
              style={styles.statusItem}
              onPress={() => setShowCreate(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Yeni durum ekle"
            >
              <View style={[styles.ringOuter, { borderColor: colors.primary, borderStyle: "dashed" }]}>
                <View style={[styles.ringInner, { backgroundColor: colors.primary + "12" }]}>
                  <View style={styles.addBtn}>
                    <Feather name="plus" size={22} color={colors.primary} />
                  </View>
                </View>
              </View>
              <Text style={[styles.statusName, { color: colors.mutedForeground }]}>Durum Ekle</Text>
            </TouchableOpacity>
          )}

          {loading && (
            <View style={styles.loadingItem}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}

          {/* Diğer kullanıcıların durumları */}
          {othersGroups.map((group) => (
            <StatusAvatar
              key={group.uid}
              group={group}
              isOwn={false}
              userId={user?.uid}
              onPress={handleOpenStatus}
            />
          ))}
        </ScrollView>
      </View>

      {/* Durum görüntüleme modalı */}
      {viewedStatus && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={closeViewer}
          statusBarTranslucent
        >
          <TouchableOpacity
            style={styles.viewerBackdrop}
            activeOpacity={1}
            onPress={closeViewer}
          >
            <View style={[styles.viewerCard, { backgroundColor: viewedStatus.backgroundColor ?? "#1a0a2e" }]}>
              {viewedGroup && (
                <View style={styles.viewerProgress}>
                  {viewedGroup.statuses.map((status, index) => (
                    <View
                      key={status.id}
                      style={[
                        styles.viewerProgressSegment,
                        { backgroundColor: index <= viewedIndex ? "#fff" : "rgba(255,255,255,0.3)" },
                      ]}
                    />
                  ))}
                </View>
              )}
              {viewedStatus.type === "image" && viewedStatus.mediaUrl ? (
                <Image
                  source={{ uri: viewedStatus.mediaUrl }}
                  style={styles.viewerImage}
                  resizeMode="contain"
                />
              ) : (
                <Text style={styles.viewerText}>{viewedStatus.text}</Text>
              )}
              <View style={styles.viewerFooter}>
                <Text style={styles.viewerName}>{viewedStatus.displayName}</Text>
                <Text style={styles.viewerViews}>
                  {viewedStatus.viewedBy.length} kişi gördü
                </Text>
              </View>
              <TouchableOpacity
                style={styles.viewerClose}
                onPress={closeViewer}
              >
                <Feather name="x" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.viewerPrevious} onPress={goPreviousStatus} />
              <TouchableOpacity style={styles.viewerNext} onPress={goNextStatus} />
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Durum oluşturma modalı */}
      <Modal
        visible={showCreate}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreate(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.createBackdrop}
          activeOpacity={1}
          onPress={() => setShowCreate(false)}
        />
        <View style={[styles.createSheet, { backgroundColor: colors.card }]}>
          <View style={styles.handle} />
          <Text style={[styles.createTitle, { color: colors.foreground }]}>Durum Paylaş</Text>

          {/* Tip seç */}
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBtn, createType === "text" && { backgroundColor: colors.primary + "33", borderColor: colors.primary }]}
              onPress={() => setCreateType("text")}
            >
              <Feather name="type" size={16} color={createType === "text" ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.typeBtnText, { color: createType === "text" ? colors.primary : colors.mutedForeground }]}>Metin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, createType === "image" && { backgroundColor: colors.primary + "33", borderColor: colors.primary }]}
              onPress={handlePickImage}
            >
              <Feather name="image" size={16} color={createType === "image" ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.typeBtnText, { color: createType === "image" ? colors.primary : colors.mutedForeground }]}>Fotoğraf</Text>
            </TouchableOpacity>
          </View>

          {createType === "text" ? (
            <>
              {/* Önizleme */}
              <View style={[styles.textPreview, { backgroundColor: createBg }]}>
                <Text style={styles.textPreviewContent}>
                  {createText.trim() || "Durumunu buraya yaz…"}
                </Text>
              </View>
              {/* Renk seç */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={styles.colorRow}>
                  {TEXT_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCreateBg(c)}
                      style={[styles.colorDot, { backgroundColor: c }, createBg === c && styles.colorDotSelected]}
                    />
                  ))}
                </View>
              </ScrollView>
              {/* Metin girişi */}
              <TextInput
                value={createText}
                onChangeText={setCreateText}
                placeholder="Ne düşünüyorsun?"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.createInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                multiline
                maxLength={200}
              />
            </>
          ) : createImageUri ? (
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: createImageUri }} style={styles.imagePreview} resizeMode="cover" />
              <TouchableOpacity style={styles.imageRemove} onPress={() => { setCreateImageUri(null); setCreateType("text"); }}>
                <Feather name="x" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.imagePick, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={handlePickImage}
            >
              <Feather name="image" size={32} color={colors.mutedForeground} />
              <Text style={[styles.imagePickText, { color: colors.mutedForeground }]}>Fotoğraf seç</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleCreate}
            disabled={submitting || (createType === "text" ? !createText.trim() : !createImageUri)}
            style={[
              styles.submitBtn,
              { backgroundColor: (createType === "text" ? createText.trim() : createImageUri) ? colors.primary : colors.muted },
            ]}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.submitBtnText}>24 Saat Paylaş</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: 1 },
  barScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 14 },
  statusItem: { alignItems: "center", gap: 5, width: 62 },
  ringOuter: { width: 60, height: 60, borderRadius: 30, borderWidth: 2.5, padding: 2 },
  ringInner: { flex: 1, borderRadius: 28, overflow: "hidden" },
  statusAvatar: { width: "100%", height: "100%", borderRadius: 26 },
  statusAvatarInitial: { fontSize: 20, fontFamily: "Inter_700Bold" },
  addBtn: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingItem: { width: 48, alignItems: "center", justifyContent: "center" },
  statusName: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },

  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  viewerCard: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  viewerProgress: {
    position: "absolute",
    top: 8,
    left: 10,
    right: 10,
    zIndex: 4,
    flexDirection: "row",
    gap: 4,
  },
  viewerProgressSegment: {
    height: 3,
    flex: 1,
    borderRadius: 2,
  },
  viewerPrevious: {
    position: "absolute",
    top: 56,
    bottom: 56,
    left: 0,
    width: "35%",
    zIndex: 2,
  },
  viewerNext: {
    position: "absolute",
    top: 56,
    bottom: 56,
    right: 0,
    width: "35%",
    zIndex: 2,
  },
  viewerImage: { width: "100%", height: 300, borderRadius: 12 },
  viewerText: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
    lineHeight: 34,
  },
  viewerFooter: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewerName: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  viewerViews: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular" },
  viewerClose: { position: "absolute", top: 14, right: 14 },

  createBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  createSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    gap: 14,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(150,150,180,0.4)", alignSelf: "center", marginBottom: 6 },
  createTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  typeRow: { flexDirection: "row", gap: 10 },
  typeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: "transparent" },
  typeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  textPreview: {
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 100,
  },
  textPreviewContent: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  colorRow: { flexDirection: "row", gap: 10, paddingVertical: 2, paddingHorizontal: 2 },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorDotSelected: { transform: [{ scale: 1.2 }], borderWidth: 2.5, borderColor: "#fff" },
  createInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 80,
    textAlignVertical: "top",
  },
  imagePick: { borderRadius: 14, borderWidth: 1, borderStyle: "dashed", height: 140, alignItems: "center", justifyContent: "center", gap: 8 },
  imagePickText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  imagePreviewWrap: { position: "relative", borderRadius: 14, overflow: "hidden" },
  imagePreview: { width: "100%", height: 180, borderRadius: 14 },
  imageRemove: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 14, padding: 4 },
  submitBtn: { paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
