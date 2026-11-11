import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPendingChapters,
  updateChapterStatus,
  getReports,
  resolveReport,
  banUser,
  unbanUser,
  searchUsersForMod,
  getAllUsersForMod,
  getUserEmailsForMod,
  setUserRole,
  getUserById,
  getInlineCommentById,
  deleteInlineComment,
  unpublishStory,
  unpublishChapter,
  sendModeratorDirective,
  getStory,
  getChapter,
  Chapter,
  Report,
  UserSummary,
  Story,
  InlineComment,
} from "@/lib/firestore-service";

// ─── Yardımcı bileşenler ─────────────────────────────────────────────────────

function SectionEmpty({ icon, text }: { icon: string; text: string }) {
  const colors = useColors();
  return (
    <View style={emp.wrap}>
      <Text style={emp.icon}>{icon}</Text>
      <Text style={[emp.text, { color: colors.mutedForeground }]}>{text}</Text>
    </View>
  );
}
const emp = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 48, gap: 10 },
  icon: { fontSize: 36 },
  text: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});

// ─── Bölüm İnceleme Sekmesi ───────────────────────────────────────────────────

function ReviewTab() {
  const colors = useColors();
  const [chapters, setChapters] = useState<(Chapter & { storyTitle?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    getPendingChapters()
      .then(setChapters)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDecision = async (ch: Chapter, approve: boolean) => {
    setProcessing(ch.id);
    try {
      await updateChapterStatus(ch.id, approve ? "published" : "rejected");
      setChapters(prev => prev.filter(c => c.id !== ch.id));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  if (chapters.length === 0) return <SectionEmpty icon="✅" text={"İnceleme bekleyen\nbölüm yok!"} />;

  return (
    <View style={{ gap: 12 }}>
      {chapters.map(ch => (
        <View key={ch.id} style={[rv.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {ch.storyTitle && (
            <Text style={[rv.storyTitle, { color: colors.primary }]} numberOfLines={1}>📖 {ch.storyTitle}</Text>
          )}
          <Text style={[rv.chTitle, { color: colors.foreground }]} numberOfLines={2}>{ch.title}</Text>
          <Text style={[rv.preview, { color: colors.mutedForeground }]} numberOfLines={3}>
            {ch.content?.slice(0, 180)}…
          </Text>
          {ch.wordCount != null && (
            <Text style={[rv.meta, { color: colors.mutedForeground }]}>{ch.wordCount.toLocaleString("tr")} kelime</Text>
          )}
          <View style={rv.btns}>
            <TouchableOpacity
              style={[rv.btn, { borderColor: "#ef444466", backgroundColor: "#ef444411" }]}
              onPress={() => handleDecision(ch, false)}
              disabled={processing === ch.id}
            >
              {processing === ch.id
                ? <ActivityIndicator size="small" color="#ef4444" />
                : <><Feather name="x-circle" size={15} color="#ef4444" /><Text style={[rv.btnText, { color: "#ef4444" }]}>Reddet</Text></>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[rv.btn, { borderColor: "#22c55e66", backgroundColor: "#22c55e11" }]}
              onPress={() => handleDecision(ch, true)}
              disabled={processing === ch.id}
            >
              {processing === ch.id
                ? <ActivityIndicator size="small" color="#22c55e" />
                : <><Feather name="check-circle" size={15} color="#22c55e" /><Text style={[rv.btnText, { color: "#22c55e" }]}>Onayla</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}
const rv = StyleSheet.create({
  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  storyTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  chTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  preview: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  btns: { flexDirection: "row", gap: 8, marginTop: 4 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  btnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

// ─── Şikayetler Sekmesi ───────────────────────────────────────────────────────

const REPORT_LABELS: Record<string, string> = {
  story: "Hikaye", chapter: "Bölüm", comment: "Yorum", user: "Kullanıcı",
};

type ReportDetail = {
  reporter: (UserSummary & { bio?: string }) | null;
  reported: (UserSummary & { bio?: string }) | null;
  story: Story | null;
  chapter: (Chapter & { storyTitle?: string }) | null;
  comment: InlineComment | null;
};

function timeAgoReport(ts: { seconds: number } | undefined): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts.seconds;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)}dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa önce`;
  return `${Math.floor(diff / 86400)}g önce`;
}

function UserRow({ u, label, colors }: { u: (UserSummary & { bio?: string }) | null; label: string; colors: ReturnType<typeof useColors> }) {
  if (!u) return null;
  return (
    <View style={[dr.userRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[dr.roleLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={dr.userInner}>
        {u.avatarUrl ? (
          <Image source={{ uri: u.avatarUrl }} style={dr.avatar} />
        ) : (
          <View style={[dr.avatarFallback, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[dr.avatarInitial, { color: colors.primary }]}>{u.displayName.charAt(0)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={[dr.userName, { color: colors.foreground }]} numberOfLines={1}>{u.displayName}</Text>
            <View style={[dr.rolePill, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "33" }]}>
              <Text style={[dr.rolePillText, { color: colors.primary }]}>{u.role}</Text>
            </View>
            {u.banned && (
              <View style={[dr.rolePill, { backgroundColor: "#ef444415", borderColor: "#ef444433" }]}>
                <Text style={[dr.rolePillText, { color: "#ef4444" }]}>Askıda</Text>
              </View>
            )}
          </View>
          {u.bio ? <Text style={[dr.bio, { color: colors.mutedForeground }]} numberOfLines={1}>{u.bio}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const dr = StyleSheet.create({
  userRow: { padding: 10, borderRadius: 12, borderWidth: 1, gap: 4 },
  roleLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  userInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 15, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rolePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
  rolePillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  bio: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
});

function ReportsTab({ modUid, modName, modAvatar }: { modUid: string; modName: string; modAvatar: string }) {
  const colors = useColors();
  const [reports, setReports] = useState<Report[]>([]);
  const [details, setDetails] = useState<Record<string, ReportDetail>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  // Ban modal
  const [banTarget, setBanTarget] = useState<{ reportId: string; uid: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banSaving, setBanSaving] = useState(false);

  // Direktif modal
  const [directiveTarget, setDirectiveTarget] = useState<{ reportId: string; recipientId: string; storyId?: string; storyTitle?: string } | null>(null);
  const [directiveMsg, setDirectiveMsg] = useState("");
  const [directiveSaving, setDirectiveSaving] = useState(false);

  useEffect(() => {
    getReports("pending")
      .then(async (reps) => {
        setReports(reps);
        const detailMap: Record<string, ReportDetail> = {};
        await Promise.all(reps.map(async (r) => {
          const detail: ReportDetail = { reporter: null, reported: null, story: null, chapter: null, comment: null };
          try { detail.reporter = await getUserById(r.reporterId) as (UserSummary & { bio?: string }) | null; } catch {}
          try {
            if (r.reportedType === "user") {
              detail.reported = await getUserById(r.reportedId) as (UserSummary & { bio?: string }) | null;
            } else if (r.reportedType === "story") {
              detail.story = await getStory(r.reportedId);
            } else if (r.reportedType === "chapter") {
              const ch = await getChapter(r.reportedId);
              if (ch) {
                const st = await getStory(ch.storyId);
                detail.chapter = { ...ch, storyTitle: st?.title };
              }
            } else if (r.reportedType === "comment") {
              detail.comment = await getInlineCommentById(r.reportedId);
            }
          } catch {}
          detailMap[r.id] = detail;
        }));
        setDetails(detailMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleResolve = async (id: string, res: "resolved" | "dismissed") => {
    setProcessing(id);
    try {
      await resolveReport(id, res);
      setReports(prev => prev.filter(r => r.id !== id));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setProcessing(null);
    }
  };

  const handleUnpublishStory = async (reportId: string, storyId: string) => {
    setProcessing(reportId);
    try {
      await unpublishStory(storyId);
      await resolveReport(reportId, "resolved");
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setProcessing(null);
    }
  };

  const handleUnpublishChapter = async (reportId: string, chapterId: string) => {
    setProcessing(reportId);
    try {
      await unpublishChapter(chapterId);
      await resolveReport(reportId, "resolved");
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setProcessing(null);
    }
  };

  const handleDeleteComment = async (reportId: string, commentId: string) => {
    setProcessing(reportId);
    try {
      await deleteInlineComment(commentId);
      await resolveReport(reportId, "resolved");
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setProcessing(null);
    }
  };

  const confirmBan = async () => {
    if (!banTarget) return;
    setBanSaving(true);
    try {
      await banUser(banTarget.uid, banReason.trim() || "Topluluk kurallarını ihlal");
      await resolveReport(banTarget.reportId, "resolved");
      setReports(prev => prev.filter(r => r.id !== banTarget.reportId));
      setBanTarget(null);
      setBanReason("");
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setBanSaving(false);
    }
  };

  const confirmDirective = async () => {
    if (!directiveTarget || !directiveMsg.trim()) return;
    setDirectiveSaving(true);
    try {
      await sendModeratorDirective({
        modUid,
        modName,
        modAvatar,
        recipientId: directiveTarget.recipientId,
        storyId: directiveTarget.storyId,
        storyTitle: directiveTarget.storyTitle,
        message: directiveMsg.trim(),
      });
      await resolveReport(directiveTarget.reportId, "resolved");
      setReports(prev => prev.filter(r => r.id !== directiveTarget.reportId));
      setDirectiveTarget(null);
      setDirectiveMsg("");
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setDirectiveSaving(false);
    }
  };

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  if (reports.length === 0) return <SectionEmpty icon="🛡️" text={"Bekleyen şikayet yok!\nTüm şikayetler işlendi."} />;

  return (
    <View style={{ gap: 14 }}>
      {reports.map(r => {
        const det = details[r.id];
        const isProcessing = processing === r.id;
        const date = r.createdAt ? timeAgoReport(r.createdAt as { seconds: number }) : "";

        return (
          <View key={r.id} style={[rp.card, { backgroundColor: "#f59e0b08", borderColor: "#f59e0b33" }]}>
            {/* Başlık */}
            <View style={rp.header}>
              <View style={[rp.badge, { backgroundColor: "#f59e0b22", borderColor: "#f59e0b55" }]}>
                <Text style={rp.badgeText}>{REPORT_LABELS[r.reportedType] ?? r.reportedType}</Text>
              </View>
              {date ? <Text style={[rp.date, { color: colors.mutedForeground }]}>{date}</Text> : null}
            </View>

            {/* Şikayet sebebi */}
            {r.reason ? (
              <View style={[rp.reasonBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[rp.reasonText, { color: colors.foreground }]}>"{r.reason}"</Text>
              </View>
            ) : null}

            {/* Şikayetçi */}
            {det?.reporter && <UserRow u={det.reporter} label="Şikayetçi" colors={colors} />}

            {/* Şikayet edilen: Kullanıcı */}
            {r.reportedType === "user" && det?.reported && (
              <UserRow u={det.reported} label="Şikayet Edilen" colors={colors} />
            )}

            {/* Şikayet edilen: Hikaye */}
            {r.reportedType === "story" && det?.story && (
              <View style={[rp.entityBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[rp.entityLabel, { color: colors.mutedForeground }]}>Şikayet Edilen Hikaye</Text>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  {det.story.coverUrl ? (
                    <Image source={{ uri: det.story.coverUrl }} style={rp.cover} />
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={[rp.entityTitle, { color: colors.foreground }]} numberOfLines={2}>{det.story.title}</Text>
                    <Text style={[rp.entitySub, { color: colors.mutedForeground }]} numberOfLines={1}>✍️ {det.story.authorName}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Şikayet edilen: Bölüm */}
            {r.reportedType === "chapter" && det?.chapter && (
              <View style={[rp.entityBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[rp.entityLabel, { color: colors.mutedForeground }]}>Şikayet Edilen Bölüm</Text>
                <Text style={[rp.entityTitle, { color: colors.foreground }]} numberOfLines={2}>{det.chapter.title}</Text>
                {det.chapter.storyTitle && (
                  <Text style={[rp.entitySub, { color: colors.mutedForeground }]} numberOfLines={1}>📖 {det.chapter.storyTitle}</Text>
                )}
                {det.chapter.content && (
                  <Text style={[rp.entityContent, { color: colors.mutedForeground }]} numberOfLines={3}>
                    {det.chapter.content.slice(0, 200)}…
                  </Text>
                )}
              </View>
            )}

            {/* Şikayet edilen: Yorum */}
            {r.reportedType === "comment" && det?.comment && (
              <View style={[rp.entityBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[rp.entityLabel, { color: colors.mutedForeground }]}>Şikayet Edilen Yorum</Text>
                <Text style={[rp.entitySub, { color: colors.mutedForeground }]} numberOfLines={1}>✍️ {det.comment.authorName}</Text>
                <Text style={[rp.entityContent, { color: colors.foreground }]} numberOfLines={4}>"{det.comment.text}"</Text>
              </View>
            )}

            {/* Aksiyon butonları — türe göre */}
            <View style={{ gap: 6, marginTop: 4 }}>

              {/* Kullanıcı aksiyonları */}
              {r.reportedType === "user" && det?.reported && (
                <View style={rv.btns}>
                  {!det.reported.banned ? (
                    <TouchableOpacity
                      style={[rv.btn, { borderColor: "#ef444466", backgroundColor: "#ef444411" }]}
                      onPress={() => { setBanTarget({ reportId: r.id, uid: det.reported!.uid }); setBanReason(""); }}
                      disabled={isProcessing}
                    >
                      <Feather name="slash" size={14} color="#ef4444" />
                      <Text style={[rv.btnText, { color: "#ef4444" }]}>Askıya Al</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[rv.btn, { borderColor: "#22c55e66", backgroundColor: "#22c55e11" }]}
                      onPress={async () => {
                        setProcessing(r.id);
                        try { await unbanUser(det.reported!.uid); await resolveReport(r.id, "resolved"); setReports(prev => prev.filter(x => x.id !== r.id)); }
                        catch { Alert.alert("Hata", "İşlem başarısız."); }
                        finally { setProcessing(null); }
                      }}
                      disabled={isProcessing}
                    >
                      <Feather name="shield-off" size={14} color="#22c55e" />
                      <Text style={[rv.btnText, { color: "#22c55e" }]}>Yasağı Kaldır</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[rv.btn, { borderColor: colors.border }]}
                    onPress={() => handleResolve(r.id, "dismissed")}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : (
                      <><Feather name="x" size={14} color={colors.mutedForeground} /><Text style={[rv.btnText, { color: colors.mutedForeground }]}>Reddet</Text></>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Hikaye aksiyonları */}
              {r.reportedType === "story" && (
                <View style={rv.btns}>
                  <TouchableOpacity
                    style={[rv.btn, { borderColor: "#ef444466", backgroundColor: "#ef444411" }]}
                    onPress={() => handleUnpublishStory(r.id, r.reportedId)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <ActivityIndicator size="small" color="#ef4444" /> : (
                      <><Feather name="eye-off" size={14} color="#ef4444" /><Text style={[rv.btnText, { color: "#ef4444" }]}>Yayından Kaldır</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[rv.btn, { borderColor: colors.border }]}
                    onPress={() => handleResolve(r.id, "dismissed")}
                    disabled={isProcessing}
                  >
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                    <Text style={[rv.btnText, { color: colors.mutedForeground }]}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Bölüm aksiyonları */}
              {r.reportedType === "chapter" && (
                <View style={{ gap: 6 }}>
                  <View style={rv.btns}>
                    <TouchableOpacity
                      style={[rv.btn, { borderColor: "#ef444466", backgroundColor: "#ef444411" }]}
                      onPress={() => handleUnpublishChapter(r.id, r.reportedId)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? <ActivityIndicator size="small" color="#ef4444" /> : (
                        <><Feather name="eye-off" size={14} color="#ef4444" /><Text style={[rv.btnText, { color: "#ef4444" }]}>Yayından Kaldır</Text></>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[rv.btn, { borderColor: colors.border }]}
                      onPress={() => handleResolve(r.id, "dismissed")}
                      disabled={isProcessing}
                    >
                      <Feather name="x" size={14} color={colors.mutedForeground} />
                      <Text style={[rv.btnText, { color: colors.mutedForeground }]}>Reddet</Text>
                    </TouchableOpacity>
                  </View>
                  {det?.chapter && (
                    <TouchableOpacity
                      style={[rv.btn, { borderColor: "#f59e0b66", backgroundColor: "#f59e0b11" }]}
                      onPress={() => setDirectiveTarget({
                        reportId: r.id,
                        recipientId: det.chapter!.storyId,
                        storyId: det.chapter!.storyId,
                        storyTitle: det.chapter!.storyTitle,
                      })}
                      disabled={isProcessing}
                    >
                      <Feather name="send" size={14} color="#f59e0b" />
                      <Text style={[rv.btnText, { color: "#f59e0b" }]}>Yazara Direktif Gönder</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Yorum aksiyonları */}
              {r.reportedType === "comment" && (
                <View style={rv.btns}>
                  <TouchableOpacity
                    style={[rv.btn, { borderColor: "#ef444466", backgroundColor: "#ef444411" }]}
                    onPress={() => handleDeleteComment(r.id, r.reportedId)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <ActivityIndicator size="small" color="#ef4444" /> : (
                      <><Feather name="trash-2" size={14} color="#ef4444" /><Text style={[rv.btnText, { color: "#ef4444" }]}>Yorumu Sil</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[rv.btn, { borderColor: colors.border }]}
                    onPress={() => handleResolve(r.id, "dismissed")}
                    disabled={isProcessing}
                  >
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                    <Text style={[rv.btnText, { color: colors.mutedForeground }]}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        );
      })}

      {/* Ban Modal */}
      <Modal visible={banTarget !== null} transparent animationType="fade" onRequestClose={() => setBanTarget(null)}>
        <Pressable style={md.overlay} onPress={() => setBanTarget(null)}>
          <Pressable style={[md.sheet, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[md.title, { color: colors.foreground }]}>Hesabı Askıya Al</Text>
            <Text style={[md.sub, { color: colors.mutedForeground }]}>Askıya alma sebebini girin (isteğe bağlı).</Text>
            <TextInput
              value={banReason}
              onChangeText={setBanReason}
              placeholder="Sebep..."
              placeholderTextColor={colors.mutedForeground}
              style={[md.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              multiline
              numberOfLines={3}
            />
            <View style={md.actions}>
              <TouchableOpacity style={[md.btn, { borderColor: colors.border }]} onPress={() => setBanTarget(null)}>
                <Text style={[md.btnText, { color: colors.mutedForeground }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[md.btn, { borderColor: "#ef444466", backgroundColor: "#ef444422" }]}
                onPress={confirmBan}
                disabled={banSaving}
              >
                {banSaving ? <ActivityIndicator size="small" color="#ef4444" /> : (
                  <Text style={[md.btnText, { color: "#ef4444" }]}>Askıya Al</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Direktif Modal */}
      <Modal visible={directiveTarget !== null} transparent animationType="fade" onRequestClose={() => setDirectiveTarget(null)}>
        <Pressable style={md.overlay} onPress={() => setDirectiveTarget(null)}>
          <Pressable style={[md.sheet, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[md.title, { color: colors.foreground }]}>Yazara Direktif Gönder</Text>
            <Text style={[md.sub, { color: colors.mutedForeground }]}>Yazar bildirim olarak bu mesajı alacak.</Text>
            <TextInput
              value={directiveMsg}
              onChangeText={setDirectiveMsg}
              placeholder="Direktif mesajınızı yazın..."
              placeholderTextColor={colors.mutedForeground}
              style={[md.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              multiline
              numberOfLines={4}
            />
            <View style={md.actions}>
              <TouchableOpacity style={[md.btn, { borderColor: colors.border }]} onPress={() => setDirectiveTarget(null)}>
                <Text style={[md.btnText, { color: colors.mutedForeground }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[md.btn, { borderColor: "#f59e0b66", backgroundColor: "#f59e0b22" }]}
                onPress={confirmDirective}
                disabled={directiveSaving || !directiveMsg.trim()}
              >
                {directiveSaving ? <ActivityIndicator size="small" color="#f59e0b" /> : (
                  <Text style={[md.btnText, { color: "#f59e0b" }]}>Gönder</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
const rp = StyleSheet.create({
  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#f59e0b" },
  date: { fontSize: 11, fontFamily: "Inter_400Regular" },
  reasonBox: { padding: 10, borderRadius: 10, borderWidth: 1 },
  reasonText: { fontSize: 13, fontFamily: "Inter_400Regular", fontStyle: "italic", lineHeight: 18 },
  entityBox: { padding: 10, borderRadius: 12, borderWidth: 1, gap: 4 },
  entityLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  entityTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  entitySub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  entityContent: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginTop: 4 },
  cover: { width: 44, height: 60, borderRadius: 8 },
});
const md = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "center", alignItems: "center", padding: 24 },
  sheet: { width: "100%", borderRadius: 18, borderWidth: 1, padding: 20, gap: 12 },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 13, fontFamily: "Inter_400Regular", minHeight: 80, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  btn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

// ─── Kullanıcı Askıya Al Sekmesi ──────────────────────────────────────────────

function BanTab() {
  const colors = useColors();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [banReason, setBanReason] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = term.trim();
    if (!t) { setResults([]); setSearched(false); return; }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const users = await searchUsersForMod(t);
        if (!cancelled) { setResults(users); setSearched(true); }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [term]);

  const handleBan = async (u: UserSummary) => {
    const reason = banReason[u.uid]?.trim() || "Topluluk kurallarını ihlal";
    setSaving(u.uid);
    try {
      await banUser(u.uid, reason);
      setResults(prev => prev.map(r => r.uid === u.uid ? { ...r, banned: true, banReason: reason } : r));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setSaving(null);
    }
  };

  const handleUnban = async (u: UserSummary) => {
    setSaving(u.uid);
    try {
      await unbanUser(u.uid);
      setResults(prev => prev.map(r => r.uid === u.uid ? { ...r, banned: false, banReason: "" } : r));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={[bn.hint, { color: colors.mutedForeground }]}>
        Kullanıcıyı askıya al veya yasağını kaldır. Askıya alınan kullanıcılar içerik üretemez.
      </Text>
      <View style={[bn.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Kullanıcı adı ara..."
          placeholderTextColor={colors.mutedForeground}
          style={[bn.searchInput, { color: colors.foreground }]}
          autoCapitalize="none"
        />
      </View>

      {loading && <ActivityIndicator color={colors.primary} />}
      {!loading && searched && results.length === 0 && (
        <Text style={[bn.noResult, { color: colors.mutedForeground }]}>Kullanıcı bulunamadı.</Text>
      )}
      {!loading && !searched && (
        <Text style={[bn.noResult, { color: colors.mutedForeground }]}>Aramak için kullanıcı adı yaz.</Text>
      )}

      {!loading && results.map(u => (
        <View
          key={u.uid}
          style={[bn.userCard, { backgroundColor: colors.card, borderColor: u.banned ? "#ef444444" : colors.border }]}
        >
          <View style={bn.userRow}>
            {u.avatarUrl ? (
              <Image source={{ uri: u.avatarUrl }} style={bn.avatar} />
            ) : (
              <View style={[bn.avatarFallback, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[bn.avatarInitial, { color: colors.primary }]}>{u.displayName.charAt(0)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[bn.userName, { color: colors.foreground }]} numberOfLines={1}>{u.displayName}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                <View style={[bn.roleBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                  <Text style={[bn.roleBadgeText, { color: colors.primary }]}>{u.role}</Text>
                </View>
                {u.banned && (
                  <View style={[bn.roleBadge, { backgroundColor: "#ef444415", borderColor: "#ef444440" }]}>
                    <Text style={[bn.roleBadgeText, { color: "#ef4444" }]}>Askıya Alındı</Text>
                  </View>
                )}
              </View>
              {u.banned && u.banReason && (
                <Text style={[bn.banReason, { color: "#ef444499" }]} numberOfLines={1}>Sebep: {u.banReason}</Text>
              )}
            </View>
          </View>

          {!u.banned && (
            <View style={{ gap: 6, marginTop: 6 }}>
              <TextInput
                value={banReason[u.uid] ?? ""}
                onChangeText={t => setBanReason(prev => ({ ...prev, [u.uid]: t }))}
                placeholder="Askıya alma sebebi (isteğe bağlı)"
                placeholderTextColor={colors.mutedForeground}
                style={[bn.reasonInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              />
              <TouchableOpacity
                style={[rv.btn, { borderColor: "#ef444466", backgroundColor: "#ef444411" }]}
                onPress={() => handleBan(u)}
                disabled={saving === u.uid || u.role === "admin"}
              >
                {saving === u.uid
                  ? <ActivityIndicator size="small" color="#ef4444" />
                  : <><Feather name="slash" size={14} color="#ef4444" /><Text style={[rv.btnText, { color: "#ef4444" }]}>Askıya Al</Text></>
                }
              </TouchableOpacity>
            </View>
          )}

          {u.banned && (
            <TouchableOpacity
              style={[rv.btn, { borderColor: "#22c55e66", backgroundColor: "#22c55e11", marginTop: 6 }]}
              onPress={() => handleUnban(u)}
              disabled={saving === u.uid}
            >
              {saving === u.uid
                ? <ActivityIndicator size="small" color="#22c55e" />
                : <><Feather name="shield-off" size={14} color="#22c55e" /><Text style={[rv.btnText, { color: "#22c55e" }]}>Yasağı Kaldır</Text></>
              }
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}
const bn = StyleSheet.create({
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  noResult: { textAlign: "center", paddingVertical: 24, fontSize: 13, fontFamily: "Inter_400Regular" },
  userCard: { padding: 12, borderRadius: 14, borderWidth: 1, gap: 2 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 16, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
  roleBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  banReason: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  reasonInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, fontFamily: "Inter_400Regular" },
});

// ─── Kullanıcı Yönetimi Sekmesi (Sadece Admin) ────────────────────────────────

const ROLE_LABELS: Record<string, string> = { user: "Kullanıcı", moderator: "Moderatör", admin: "Admin" };
type UserListFilter = "all" | "latest" | "today";

function userRegistrationDate(user: UserSummary): Date | null {
  const createdAt = user.createdAt;
  if (!createdAt) return null;
  try {
    const date = createdAt.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function turkeyDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatUserRegistrationDate(user: UserSummary): string {
  const date = userRegistrationDate(user);
  if (!date) return "Kayıt tarihi bulunamadı";
  return `Kayıt: ${new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function UsersTab({ currentUid }: { currentUid: string }) {
  const colors = useColors();
  const [term, setTerm] = useState("");
  const [listFilter, setListFilter] = useState<UserListFilter>("all");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [visibleCount, setVisibleCount] = useState(50);
  const [saving, setSaving] = useState<string | null>(null);
  const [emailByUid, setEmailByUid] = useState<Record<string, string>>({});
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailRetry, setEmailRetry] = useState(0);

  useEffect(() => {
    setLoading(true); setError(""); setResults([]); setVisibleCount(50);
    setEmailByUid({}); setEmailError("");
    let cancelled = false;
    void (async () => {
      try {
        const users = await getAllUsersForMod();
        if (!cancelled) setResults(users);
      } catch {
        if (!cancelled) setError("Kullanıcılar yüklenemedi. Bağlantını ve yönetici izinlerini kontrol edip yeniden dene.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUid, reload]);

  const needle = term.trim().toLocaleLowerCase("tr");
  const matchingUsers = results.filter(u => u.displayName.toLocaleLowerCase("tr").includes(needle)
    || u.uid.toLocaleLowerCase("tr").includes(needle));
  const todayKey = turkeyDateKey(new Date());
  const filtered = matchingUsers
    .filter(user => listFilter !== "today" || (
      userRegistrationDate(user) !== null && turkeyDateKey(userRegistrationDate(user)!) === todayKey
    ))
    .sort((a, b) => {
      if (listFilter === "all") return a.displayName.localeCompare(b.displayName, "tr");
      return (userRegistrationDate(b)?.getTime() ?? 0) - (userRegistrationDate(a)?.getTime() ?? 0);
    });
  const visibleUidKey = filtered.slice(0, visibleCount).map(u => u.uid).join(",");

  useEffect(() => {
    const uids = visibleUidKey ? visibleUidKey.split(",") : [];
    const missing = uids.filter(uid => !Object.prototype.hasOwnProperty.call(emailByUid, uid));
    if (missing.length === 0) return;

    let cancelled = false;
    setEmailLoading(true);
    setEmailError("");
    void getUserEmailsForMod(missing).then(emails => {
      if (!cancelled) setEmailByUid(prev => ({ ...prev, ...emails }));
    }).catch(() => {
      if (!cancelled) setEmailError("E-posta adresleri alınamadı. Yönetici bağlantısını kontrol edip yeniden dene.");
    }).finally(() => {
      if (!cancelled) setEmailLoading(false);
    });
    return () => { cancelled = true; };
  }, [visibleUidKey, emailRetry]);

  const handleRole = async (u: UserSummary, newRole: "user" | "moderator" | "admin") => {
    if (u.uid === currentUid) { Alert.alert("Hata", "Kendi rolünü değiştiremezsin."); return; }
    setSaving(u.uid);
    try {
      await setUserRole(u.uid, newRole);
      setResults(prev => prev.map(r => r.uid === u.uid ? { ...r, role: newRole } : r));
    } catch {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={[bn.hint, { color: colors.mutedForeground }]}>
        Kayıtlı kullanıcıları görüntüle, profillerini aç ve rollerini yönet.
      </Text>
      <TouchableOpacity disabled={loading} onPress={() => setReload(n => n + 1)} accessibilityRole="button">
        <Text style={{ color: colors.primary }}>Yenile</Text>
      </TouchableOpacity>
      <View style={[bn.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={term}
          onChangeText={value => { setTerm(value); setVisibleCount(50); }}
          placeholder="Ad veya kullanıcı kimliği ara..."
          accessibilityLabel="Kullanıcı ara"
          placeholderTextColor={colors.mutedForeground}
          style={[bn.searchInput, { color: colors.foreground }]}
          autoCapitalize="none"
        />
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {([
          ["all", "Tümü"],
          ["latest", "Son kaydolanlar"],
          ["today", "Bugün kaydolanlar"],
        ] as const).map(([filter, label]) => {
          const selected = listFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => { setListFilter(filter); setVisibleCount(50); }}
              style={{
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primary + "18" : colors.card,
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              <Text style={{ color: selected ? colors.primary : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {loading && <ActivityIndicator color={colors.primary} />}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
      {!loading && !error && <Text style={{ color: colors.mutedForeground }}>{filtered.length} / {results.length} kullanıcı</Text>}
      {!loading && !error && emailError ? (
        <TouchableOpacity onPress={() => setEmailRetry(n => n + 1)} accessibilityRole="button">
          <Text style={{ color: colors.destructive }}>{emailError} Yeniden dene</Text>
        </TouchableOpacity>
      ) : null}
      {!loading && !error && filtered.length === 0 && (
        <Text style={[bn.noResult, { color: colors.mutedForeground }]}>{needle ? "Aramana uygun kullanıcı bulunamadı." : "Henüz kayıtlı kullanıcı yok."}</Text>
      )}
      {!loading && !error && filtered.slice(0, visibleCount).map(u => (
        <View key={u.uid} style={[bn.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={bn.userRow}>
            {u.avatarUrl ? (
              <Image source={{ uri: u.avatarUrl }} style={bn.avatar} />
            ) : (
              <View style={[bn.avatarFallback, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[bn.avatarInitial, { color: colors.primary }]}>{u.displayName.charAt(0)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[bn.userName, { color: colors.foreground }]}>{u.displayName}</Text>
              <Text selectable style={{ color: colors.mutedForeground, fontSize: 11 }}>
                {Object.prototype.hasOwnProperty.call(emailByUid, u.uid)
                  ? emailByUid[u.uid] || "E-posta bulunamadı"
                  : emailError ? "E-posta alınamadı" : emailLoading ? "E-posta yükleniyor..." : "E-posta bekleniyor"}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>
                {formatUserRegistrationDate(u)}
              </Text>
              <Text style={[bn.roleBadgeText, { color: colors.mutedForeground, marginTop: 2 }]}>{ROLE_LABELS[u.role] ?? u.role}</Text>
            </View>
            {saving === u.uid && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.push({ pathname: "/user/[id]", params: { id: u.uid } })}>
            <Text style={{ color: colors.primary, marginTop: 8 }}>Profili aç</Text>
          </TouchableOpacity>
          {u.uid !== currentUid && (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
              {(["user", "moderator", "admin"] as const).map(role => (
                <TouchableOpacity
                  key={role}
                  style={[
                    ug.roleBtn,
                    {
                      borderColor: u.role === role ? colors.primary : colors.border,
                      backgroundColor: u.role === role ? colors.primary + "20" : "transparent",
                    },
                  ]}
                  onPress={() => handleRole(u, role)}
                  disabled={u.role === role || saving === u.uid}
                >
                  <Text style={[ug.roleBtnText, { color: u.role === role ? colors.primary : colors.mutedForeground }]}>
                    {ROLE_LABELS[role]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ))}
      {!loading && !error && visibleCount < filtered.length && <TouchableOpacity onPress={() => setVisibleCount(n => n + 50)} accessibilityRole="button">
        <Text style={{ color: colors.primary, textAlign: "center", padding: 12 }}>
          Daha fazla göster ({filtered.length - visibleCount}){emailLoading ? " · E-postalar yükleniyor..." : ""}
        </Text>
      </TouchableOpacity>}
    </View>
  );
}
const ug = StyleSheet.create({
  roleBtn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  roleBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

// ─── Ana Ekran ────────────────────────────────────────────────────────────────

type TabKey = "review" | "reports" | "ban" | "users";

const TABS: { key: TabKey; label: string; icon: string; minRole: "moderator" | "admin" }[] = [
  { key: "review", label: "İnceleme", icon: "eye", minRole: "moderator" },
  { key: "reports", label: "Şikayetler", icon: "alert-triangle", minRole: "moderator" },
  { key: "ban", label: "Askıya Al", icon: "slash", minRole: "moderator" },
  { key: "users", label: "Kullanıcılar", icon: "users", minRole: "admin" },
];

export default function ModeratorScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<TabKey>("review");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/auth"); return; }
    if (profile && profile.role !== "moderator" && profile.role !== "admin") {
      router.back();
    }
  }, [user, profile, authLoading]);

  if (authLoading || !profile) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const isAdmin = profile.role === "admin";
  const visibleTabs = TABS.filter(t => t.minRole === "moderator" || isAdmin);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Başlık */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.titleRow}>
          <Feather name="shield" size={18} color={colors.primary} />
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Moderatör Paneli</Text>
        </View>
        <View style={[s.rolePill, { backgroundColor: isAdmin ? "#f59e0b22" : colors.primary + "22", borderColor: isAdmin ? "#f59e0b55" : colors.primary + "55" }]}>
          <Text style={[s.rolePillText, { color: isAdmin ? "#f59e0b" : colors.primary }]}>
            {isAdmin ? "👑 Admin" : "🛡️ Mod"}
          </Text>
        </View>
      </View>

      {/* Sekmeler */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.tabsBar, { borderColor: colors.border }]} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {visibleTabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t.key)}
          >
            <Feather name={t.icon as any} size={14} color={tab === t.key ? colors.primary : colors.mutedForeground} />
            <Text style={[s.tabText, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* İçerik */}
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {tab === "review" && <ReviewTab />}
        {tab === "reports" && user && profile && (
          <ReportsTab
            modUid={user.uid}
            modName={profile.displayName ?? "Moderatör"}
            modAvatar={profile.avatarUrl ?? ""}
          />
        )}
        {tab === "ban" && <BanTab />}
        {tab === "users" && isAdmin && user && <UsersTab currentUid={user.uid} />}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  rolePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  rolePillText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  tabsBar: { borderBottomWidth: 1, flexGrow: 0 },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 12 },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  scroll: { padding: 16, gap: 4 },
});
