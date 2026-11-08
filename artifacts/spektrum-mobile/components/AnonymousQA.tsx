import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import ViewShot, { releaseCapture } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { isShareableQuestion } from "@workspace/anonymous-qa";
import { useColors } from "@/hooks/useColors";
import { getPublicShareUrl, getPublicQuestionInvitationUrl } from "@/lib/share-links";
import {
  answerQuestion, deleteQuestion, listenAnsweredQuestions, listenUnansweredQuestions,
  qaErrorMessage, sendAnonymousQuestion, getPublicAnsweredQuestion, type AnonymousQuestion,
} from "@/lib/anonymous-qa";

export default function AnonymousQA({ targetUid, displayName, isOwner }: { targetUid: string; displayName: string; isOwner: boolean }) {
  const colors = useColors();
  const [answered, setAnswered] = useState<AnonymousQuestion[]>([]);
  const [pending, setPending] = useState<AnonymousQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<AnonymousQuestion | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<ViewShot>(null);
  const url = getPublicQuestionInvitationUrl(targetUid);
  useEffect(() => {
    let active = true, answeredReady = false, pendingReady = !isOwner;
    setAnswered([]); setPending([]); setLoading(true); setError("");
    setText(""); setEditingId(null); setAnswer(""); setCard(null);
    const ready = () => { if (active && answeredReady && pendingReady) setLoading(false); };
    const fail = (e: Error) => { if (active) { setError(e.message); setLoading(false); } };
    const stopAnswered = listenAnsweredQuestions(targetUid, items => {
      if (active) {
        setAnswered(items);
        setCard(previous => previous ? items.find(q => q.id === previous.id) ?? null : null);
        answeredReady = true; ready();
      }
    }, fail);
    const stopPending = isOwner ? listenUnansweredQuestions(targetUid, items => {
      if (active) { setPending(items); pendingReady = true; ready(); }
    }, fail) : undefined;
    return () => { active = false; stopAnswered(); stopPending?.(); };
  }, [targetUid, isOwner]);
  const inputStyle = [styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }];
  const buttonStyle = [styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }];
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(qaErrorMessage(e)); } finally { setBusy(false); }
  }
  async function shareInvitation() {
    if (!url) { Alert.alert("Bağlantı hazır değil", "Herkese açık web adresi yapılandırılmalı."); return; }
    try { await Share.share({ title: `${displayName} — SPEKTRUM`, message: `Bana anonim soru sor\n${url}`, url }); }
    catch { Alert.alert("Paylaşılamadı", "Lütfen yeniden dene."); }
  }
  async function copyInvitation() {
    if (!url) { Alert.alert("Bağlantı hazır değil", "Herkese açık web adresi yapılandırılmalı."); return; }
    try {
      await Clipboard.setStringAsync(url);
      Alert.alert("Bağlantı kopyalandı", "Instagram veya Snapchat Hikâyesine Bağlantı etiketi ekleyip kopyaladığın adresi etikete yapıştır.");
    } catch {
      Alert.alert("Bağlantı kopyalanamadı", "Soru bağlantısını seçip kopyalayabilir veya ayrıca paylaşabilirsin.");
    }
  }
  async function shareCard() {
    if (!card || !isShareableQuestion(card) || card.targetUid !== targetUid || !url || sharing) return;
    if (Platform.OS === "web") { Alert.alert("Mobil uygulamada paylaş", "PNG paylaşımı Android/iOS uygulamasında kullanılabilir."); return; }
    setSharing(true);
    let uri: string | undefined;
    try {
      const current = await getPublicAnsweredQuestion(card.id);
      if (!current || current.targetUid !== targetUid) throw new Error("Bu soru-cevap artık herkese açık değil.");
      if (current.question !== card.question || current.answer !== card.answer) {
        setCard(current);
        throw new Error("Cevap güncellendi. Güncel kartı kontrol edip yeniden paylaş.");
      }
      if (!(await Sharing.isAvailableAsync())) throw new Error("Bu cihaz görsel paylaşımını desteklemiyor.");
      uri = await cardRef.current?.capture?.();
      if (!uri) throw new Error("Kart görseli oluşturulamadı.");
      await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Anonim soru-cevabı paylaş" });
    } catch (e) { Alert.alert("Kart paylaşılamadı", qaErrorMessage(e)); }
    finally { if (uri) releaseCapture(uri); setSharing(false); }
  }
  return <View style={styles.container}>
    <Text style={[styles.title, { color: colors.foreground }]}>Anonim soru-cevap</Text>
    {isOwner ? <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.foreground }]}>Sosyal medyadan soru topla</Text>
      <Text style={{ color: colors.mutedForeground }}>Bağlantını paylaş. Gelen soruları burada cevaplayıp görsel kart olarak paylaşabilirsin. Instagram/Snapchat seçenekleri cihazının paylaşım menüsüne bağlıdır; doğrudan Story paylaşımı garanti değildir.</Text>
      {url && <Text selectable style={{ color: colors.primary, fontSize: 12 }}>{url}</Text>}
      <TouchableOpacity onPress={shareInvitation} style={buttonStyle} accessibilityRole="button">
        <Feather name="share-2" size={16} color={colors.primaryForeground} />
        <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>Soru bağlantımı paylaş</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={copyInvitation} style={{ alignItems: "center", paddingVertical: 8 }} accessibilityRole="button">
        <Text style={{ color: colors.primary, fontWeight: "700" }}>Hikâye etiketi için bağlantıyı kopyala</Text>
      </TouchableOpacity>
    </View> : <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TextInput value={text} onChangeText={setText} maxLength={280} editable={!busy} multiline
        placeholder="Anonim sorun…" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Anonim sorun" style={inputStyle} />
      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{text.length}/280</Text>
      <TouchableOpacity disabled={busy || !text.trim()} style={buttonStyle} onPress={() => perform(async () => {
        await sendAnonymousQuestion(targetUid, text); setText(""); Alert.alert("Sorun gönderildi", "Cevaplandığında bu profilde görünebilir.");
      })}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{busy ? "Gönderiliyor…" : "Anonim soru gönder"}</Text></TouchableOpacity>
    </View>}
    <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Gönderen kimliği güvenlik için sistemde tutulur; soruyu alan kişiye ve paylaşımı görenlere gösterilmez. Soru ve cevap herkese açık paylaşılabilir.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
    {loading && <ActivityIndicator color={colors.primary} />}
    {isOwner && pending.length > 0 && <Text style={[styles.label, { color: colors.foreground }]}>Yanıt bekleyen ({pending.length})</Text>}
    {isOwner && pending.map(q => <View key={q.id} style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ color: colors.foreground }}>{q.question}</Text>
      {editingId === q.id ? <>
        <TextInput multiline value={answer} onChangeText={setAnswer} maxLength={1000} editable={!busy}
          placeholder="Cevabın…" placeholderTextColor={colors.mutedForeground} style={inputStyle} accessibilityLabel="Cevabın" />
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{answer.length}/1000</Text>
        <TouchableOpacity disabled={busy || !answer.trim()} style={buttonStyle} onPress={() => perform(async () => {
          await answerQuestion(q.id, answer); setEditingId(null); setAnswer("");
        })}><Text style={{ color: colors.primaryForeground }}>Cevabı yayımla</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={() => { setEditingId(null); setAnswer(""); }}><Text style={{ color: colors.mutedForeground }}>İptal</Text></TouchableOpacity>
      </> : <TouchableOpacity disabled={busy} onPress={() => { setEditingId(q.id); setAnswer(""); }}><Text style={{ color: colors.primary }}>Cevapla</Text></TouchableOpacity>}
      <TouchableOpacity disabled={busy} onPress={() => Alert.alert("Soruyu sil", "Bu soru geri alınamaz şekilde silinecek.", [
        { text: "İptal", style: "cancel" }, { text: "Sil", style: "destructive", onPress: () => perform(async () => { await deleteQuestion(q.id); }) },
      ])}><Text style={{ color: colors.destructive }}>Sil</Text></TouchableOpacity>
    </View>)}
    {answered.map(q => <View key={q.id} style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.foreground }]}>{q.question}</Text>
      <Text style={{ color: colors.foreground, lineHeight: 22 }}>{q.answer}</Text>
      {isOwner && <View style={styles.row}>
        <TouchableOpacity onPress={() => setCard(q)}><Text style={{ color: colors.primary }}>Kartı paylaş</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={() => Alert.alert("Soru-cevabı sil", "Paylaşım bağlantısı da artık kullanılamayacak.", [
          { text: "İptal", style: "cancel" }, { text: "Sil", style: "destructive", onPress: () => perform(async () => { await deleteQuestion(q.id); }) },
        ])}><Text style={{ color: colors.destructive }}>Sil</Text></TouchableOpacity>
      </View>}
    </View>)}
    {!loading && !error && !answered.length && !pending.length && <Text style={{ color: colors.mutedForeground }}>Henüz soru-cevap yok.</Text>}
    <Modal visible={!!card} animationType="slide" onRequestClose={() => { if (!sharing) setCard(null); }}>
      <View style={[styles.modal, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Paylaşım kartın</Text>
        <ScrollView contentContainerStyle={{ paddingVertical: 16 }} removeClippedSubviews={false}>
          {card && <ViewShot ref={cardRef} options={{ format: "png", quality: 1, result: "tmpfile" }}
            style={[styles.box, { padding: 24, backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 18 }}>SPEKTRUM</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>{displayName}</Text>
            <Text style={{ color: colors.primary }}>ANONİM SORU</Text>
            <Text style={[styles.label, { color: colors.foreground, lineHeight: 25 }]}>{card.question}</Text>
            <Text style={{ color: colors.primary, marginTop: 12 }}>CEVAP</Text>
            <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 24 }}>{card.answer}</Text>
            <Text style={{ color: colors.primary, marginTop: 16 }}>Sen de bana anonim soru sor</Text>
            {url && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{url}</Text>}
          </ViewShot>}
        </ScrollView>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 12 }}>
          Görselde yazan adres tıklanamaz. Hikâyeyi paylaşırken Instagram veya Snapchat’te Bağlantı etiketi ekleyip soru bağlantısını etikete yapıştır. Bağlantı tarayıcıda açılırsa güncel Android sürümü için “SPEKTRUM uygulamasında aç” düğmesini kullanabilirsin. Sosyal uygulamanın dış bağlantı izinleri de geçerlidir.
        </Text>
        <TouchableOpacity disabled={sharing || !url} onPress={shareInvitation} style={{ paddingVertical: 12 }}>
          <Text style={{ color: colors.primary }}>Soru bağlantısını ayrıca paylaş</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={sharing || !url} onPress={copyInvitation} style={{ paddingVertical: 10 }}>
          <Text style={{ color: colors.primary, textAlign: "center", fontWeight: "700" }}>Bağlantıyı kopyala (Hikâye etiketi için)</Text>
        </TouchableOpacity>
        {Platform.OS === "web" && <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 12 }}>Bu mobil tarayıcı önizlemesinde PNG paylaşımı desteklenmez. Görseli paylaşmak için Android/iOS uygulamasını kullan.</Text>}
        <TouchableOpacity disabled={sharing || !url} style={[styles.button, { backgroundColor: colors.primary }]} onPress={shareCard}>
          <Text style={{ color: colors.primaryForeground }}>{sharing ? "Kart hazırlanıyor…" : "Görseli paylaş"}</Text>
        </TouchableOpacity>
        {Platform.OS === "web" && card && <TouchableOpacity onPress={() => {
          const page = getPublicShareUrl(`/qa/${encodeURIComponent(card.id)}`);
          if (page) void Linking.openURL(page);
        }} style={{ padding: 12 }}><Text style={{ color: colors.primary }}>Soru-cevabı web’de aç</Text></TouchableOpacity>}
        <TouchableOpacity disabled={sharing} onPress={() => setCard(null)} style={{ padding: 16 }}><Text style={{ color: colors.foreground, textAlign: "center" }}>Kapat</Text></TouchableOpacity>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 16, padding: 16 }, title: { fontSize: 22, fontWeight: "800" },
  label: { fontSize: 16, fontWeight: "700" }, box: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 110, textAlignVertical: "top" },
  button: { padding: 13, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  modal: { flex: 1, padding: 24, paddingTop: 56 },
});
