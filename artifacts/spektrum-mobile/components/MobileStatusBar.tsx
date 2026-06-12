import React, { useCallback, useEffect, useState } from "react";
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
  UserStatus,
} from "@/lib/firestore-service";
import { uploadStatusImage } from "@/lib/storage-service";

const TEXT_COLORS = [
  "#7c3aed", "#06b6d4", "#ec4899", "#10b981",
  "#f59e0b", "#ef4444", "#8b5cf6", "#3b82f6",
];

// ─── Durum dairesi ────────────────────────────────────────────────────────────

function StatusAvatar({
  status,
  isOwn,
  userId,
  onPress,
}: {
  status: UserStatus;
  isOwn: boolean;
  userId?: string;
  onPress: (s: UserStatus) => void;
}) {
  const colors = useColors();
  const viewed = userId ? status.viewedBy.includes(userId) : false;

  return (
    <TouchableOpacity
      style={styles.statusItem}
      onPress={() => onPress(status)}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.ringOuter,
          viewed
            ? { borderColor: colors.border }
            : { borderColor: colors.primary },
          isOwn && { borderColor: "#06b6d4" },
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
  const { user, profile } = useAuth();
  const [statuses, setStatuses] = useState<UserStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewedStatus, setViewedStatus] = useState<UserStatus | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [createType, setCreateType] = useState<"text" | "image">("text");
  const [createText, setCreateText] = useState("");
  const [createBg, setCreateBg] = useState(TEXT_COLORS[0]);
  const [createImageUri, setCreateImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getActiveStatuses();
      setStatuses(data);
    } catch { /* sessiz */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ownStatus = user ? statuses.find((s) => s.uid === user.uid) ?? null : null;
  const othersStatuses = user ? statuses.filter((s) => s.uid !== user.uid) : statuses;

  const handleOpenStatus = async (s: UserStatus) => {
    setViewedStatus(s);
    if (user && !s.viewedBy.includes(user.uid)) {
      await markStatusViewed(s.id, user.uid);
      setStatuses((prev) =>
        prev.map((x) => x.id === s.id ? { ...x, viewedBy: [...x.viewedBy, user.uid] } : x)
      );
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
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCreateImageUri(result.assets[0].uri);
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
        mediaUrl = await uploadStatusImage(user.uid, createImageUri);
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
      setCreateBg(TEXT_COLORS[0]);
      setCreateType("text");
      setShowCreate(false);
      await load();
    } catch {
      Alert.alert("Hata", "Durum paylaşılamadı.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOwn = async () => {
    if (!ownStatus) return;
    Alert.alert("Durumu sil", "24h durumunu silmek istiyor musun?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          await deleteStatus(ownStatus.id);
          setStatuses((prev) => prev.filter((s) => s.id !== ownStatus.id));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.loadingRow, { borderBottomColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <View style={[styles.bar, { borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.barScroll}
        >
          {/* + Ekle / Kendi durumu */}
          {user ? (
            ownStatus ? (
              <TouchableOpacity
                style={styles.statusItem}
                onPress={() => handleOpenStatus(ownStatus)}
                onLongPress={handleDeleteOwn}
                activeOpacity={0.8}
              >
                <View style={[styles.ringOuter, { borderColor: "#06b6d4" }]}>
                  <View style={[styles.ringInner, { backgroundColor: colors.background }]}>
                    {ownStatus.type === "image" && ownStatus.mediaUrl ? (
                      <Image source={{ uri: ownStatus.mediaUrl }} style={styles.statusAvatar} />
                    ) : (
                      <View style={[styles.statusAvatar, { backgroundColor: ownStatus.backgroundColor ?? colors.primary, alignItems: "center", justifyContent: "center" }]}>
                        <Text style={[styles.statusAvatarInitial, { color: "#fff" }]}>
                          {ownStatus.displayName.charAt(0).toUpperCase()}
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
            )
          ) : null}

          {/* Diğer kullanıcıların durumları */}
          {othersStatuses.map((s) => (
            <StatusAvatar
              key={s.id}
              status={s}
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
          onRequestClose={() => setViewedStatus(null)}
          statusBarTranslucent
        >
          <TouchableOpacity
            style={styles.viewerBackdrop}
            activeOpacity={1}
            onPress={() => setViewedStatus(null)}
          >
            <View style={[styles.viewerCard, { backgroundColor: viewedStatus.backgroundColor ?? "#1a0a2e" }]}>
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
                onPress={() => setViewedStatus(null)}
              >
                <Feather name="x" size={24} color="#fff" />
              </TouchableOpacity>
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
  loadingRow: { height: 90, alignItems: "center", justifyContent: "center", borderBottomWidth: 1 },
  bar: { borderBottomWidth: 1 },
  barScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 14 },
  statusItem: { alignItems: "center", gap: 5, width: 62 },
  ringOuter: { width: 60, height: 60, borderRadius: 30, borderWidth: 2.5, padding: 2 },
  ringInner: { flex: 1, borderRadius: 28, overflow: "hidden" },
  statusAvatar: { width: "100%", height: "100%", borderRadius: 26 },
  statusAvatarInitial: { fontSize: 20, fontFamily: "Inter_700Bold" },
  addBtn: { flex: 1, alignItems: "center", justifyContent: "center" },
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
