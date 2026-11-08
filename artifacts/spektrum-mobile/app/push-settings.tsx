import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { loadPushSettings, savePushSettings, sendPushTest, type PushPreferences, type PushSettings } from "@/lib/push-notifications";

type Notice = { kind: "ok" | "error"; text: string } | null;
type Key = keyof PushPreferences;

const CATEGORIES: { key: Key; icon: keyof typeof Feather.glyphMap; title: string; desc: string }[] = [
  { key: "messages", icon: "mail", title: "Mesajlar", desc: "Yeni özel mesaj ve anonim soru geldiğinde haber ver." },
  { key: "newChapters", icon: "book-open", title: "Kitaplığımdaki kitapların yeni bölümleri", desc: "Kitaplığına veya yer imlerine eklediğin kitaplara yeni bölüm geldiğinde. Takip ettiğin yazarların diğer kitapları dahil değildir." },
  { key: "comments", icon: "message-circle", title: "Yorumlar", desc: "Hikayelerine yorum yapıldığında." },
  { key: "qa", icon: "help-circle", title: "Soru-cevap", desc: "Sorduğun soru yanıtlandığında." },
];

const OFF: PushPreferences = { messages: true, newChapters: true, comments: true, qa: true };

export default function PushSettingsScreen() {
  const { t } = useLocale();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [prefs, setPrefs] = useState<PushPreferences>(OFF);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const reqId = useRef(0);
  const uidRef = useRef(uid);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  uidRef.current = uid;
  dirtyRef.current = dirty;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reqId.current++; };
  }, []);

  const apply = (s: PushSettings) => {
    setSettings(s);
    setEnabled(s.enabled);
    setPrefs(s.preferences);
    setDirty(false);
  };

  const load = useCallback(async (silent: boolean) => {
    if (!uidRef.current) { setLoading(false); return; }
    const id = ++reqId.current, owner = uidRef.current;
    if (!silent) { setLoading(true); setLoadError(null); }
    try {
      const s = await loadPushSettings();
      if (!mounted.current || id !== reqId.current || owner !== uidRef.current) return;
      setLoadError(null);
      if (dirtyRef.current && silent) setSettings(s);
      else apply(s);
    } catch (e) {
      if (!mounted.current || id !== reqId.current || owner !== uidRef.current) return;
      if (!silent) setLoadError(e instanceof Error ? e.message : "Bildirim ayarları okunamadı.");
    } finally {
      if (mounted.current && id === reqId.current) setLoading(false);
    }
  }, []);

  // Hesap değişince eski cevapları geçersiz kıl ve sıfırdan yükle.
  useEffect(() => {
    reqId.current++;
    setSettings(null); setNotice(null); setDirty(false); setEnabled(false); setPrefs(OFF);
    if (uid) load(false); else setLoading(false);
  }, [uid, load]);

  useFocusEffect(useCallback(() => {
    if (!busyRef.current) load(true);
  }, [load]));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active" && !busyRef.current) load(true);
    });
    return () => sub.remove();
  }, [load]);

  const save = async () => {
    if (!uid || busyRef.current) return;
    busyRef.current = true;
    const owner = uid, id = ++reqId.current;
    setSaving(true); setNotice(null);
    try {
      const s = await savePushSettings(enabled, prefs);
      if (!mounted.current || owner !== uidRef.current || id !== reqId.current) return;
      apply(s);
      setNotice({ kind: "ok", text: s.enabled ? "Ayarların bu telefon için kaydedildi." : "Bildirimler bu telefonda kapalı." });
    } catch (e) {
      if (!mounted.current || owner !== uidRef.current) return;
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Ayarlar kaydedilemedi." });
      load(true);
    } finally {
      busyRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const test = async () => {
    if (!uid || busyRef.current) return;
    busyRef.current = true;
    const owner = uid;
    setTesting(true); setNotice(null);
    try {
      await sendPushTest();
      if (!mounted.current || owner !== uidRef.current) return;
      setNotice({ kind: "ok", text: "Test isteği sunucu tarafından kabul edildi. Bu, bildirimin telefonuna ulaşacağını garanti etmez; birkaç saniye içinde gelmezse telefon ve pil ayarlarını kontrol et." });
    } catch (e) {
      if (!mounted.current || owner !== uidRef.current) return;
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Test bildirimi gönderilemedi." });
    } finally {
      busyRef.current = false;
      if (mounted.current) setTesting(false);
    }
  };

  const openSettings = async () => {
    try { await Linking.openSettings(); }
    catch { setNotice({ kind: "error", text: "Telefon ayarları açılamadı. Ayarlar > Uygulamalar > SPEKTRUM > Bildirimler yolunu izle." }); }
  };

  const setPref = (k: Key, v: boolean) => { setPrefs((p) => ({ ...p, [k]: v })); setDirty(true); setNotice(null); };
  const toggleMaster = (v: boolean) => { setEnabled(v); setDirty(true); setNotice(null); };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Geri" testID="push-back">
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.foreground }]}>Push Bildirimleri</Text>
    </View>
  );

  const body = () => {
    if (!user) {
      return (
        <View style={styles.center}>
          <Feather name="bell-off" size={44} color={colors.mutedForeground} />
          <Text style={[styles.desc, { color: colors.mutedForeground, textAlign: "center" }]}>Bildirim ayarları hesabına bağlıdır. Devam etmek için giriş yapmalısın.</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => router.push("/auth")} testID="push-login">
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (loading && !settings) {
      return (
        <View style={styles.content}>
          {[0, 1, 2].map((i) => <View key={i} style={[styles.skeleton, { backgroundColor: colors.muted, height: i === 0 ? 88 : 150 }]} />)}
        </View>
      );
    }
    if (loadError && !settings) {
      return (
        <View style={styles.center}>
          <Feather name="alert-circle" size={44} color={colors.destructive} />
          <Text style={[styles.desc, { color: colors.foreground, textAlign: "center" }]}>{loadError}</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => load(false)} testID="push-retry">
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (!settings) return null;

    if (!settings.supported) {
      return (
        <View style={styles.center}>
          <Feather name="smartphone" size={44} color={colors.mutedForeground} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Bu cihazda kullanılamıyor</Text>
          <Text style={[styles.desc, { color: colors.mutedForeground, textAlign: "center" }]}>{t(settings.reason ?? "")}</Text>
        </View>
      );
    }

    const denied = !settings.permissionGranted;
    const blocked = denied && !settings.canAskAgain;
    const busy = saving || testing;

    return (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.muted }]}><Feather name="bell" size={20} color={colors.primary} /></View>
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: colors.foreground }]}>Bu telefonda bildirim al</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>{enabled ? "Açık" : "Kapalı"}. Ayar yalnızca bu cihaz ve bu hesap için geçerlidir.</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={toggleMaster}
              disabled={busy || (blocked && !enabled)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.card}
              testID="push-master"
            />
          </View>
        </View>

        {blocked && (
          <View style={[styles.card, styles.pad, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
            <Text style={[styles.label, { color: colors.foreground }]}>Bildirim izni kapalı</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>Telefon, SPEKTRUM için izin penceresini artık göstermiyor. Bildirimleri telefon ayarlarından açabilirsin.</Text>
            <TouchableOpacity onPress={openSettings} style={styles.linkRow} testID="push-open-settings">
              <Feather name="settings" size={16} color={colors.primary} />
              <Text style={[styles.link, { color: colors.primary }]}>Telefon ayarlarını aç</Text>
            </TouchableOpacity>
          </View>
        )}
        {denied && !blocked && (
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>Bildirimleri açtığında telefon senden izin isteyecek.</Text>
        )}

        <Text style={[styles.section, { color: colors.mutedForeground }]}>NELERDEN HABER VERELİM</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: enabled ? 1 : 0.6 }]}>
          {CATEGORIES.map((c, i) => (
            <View key={c.key} style={[styles.row, i < CATEGORIES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <View style={[styles.icon, { backgroundColor: colors.muted }]}><Feather name={c.icon} size={18} color={colors.primary} /></View>
              <View style={styles.rowText}>
                <Text style={[styles.label, { color: colors.foreground }]}>{c.title}</Text>
                <Text style={[styles.sub, { color: colors.mutedForeground }]}>{c.desc}</Text>
              </View>
              <Switch
                value={prefs[c.key]}
                onValueChange={(v) => setPref(c.key, v)}
                disabled={busy || !enabled}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.card}
                testID={`push-pref-${c.key}`}
              />
            </View>
          ))}
        </View>

        <View style={styles.privacy}>
          <Feather name="lock" size={14} color={colors.mutedForeground} />
          <Text style={[styles.sub, { color: colors.mutedForeground, flex: 1, marginTop: 0 }]}>Bildirimlerde özel mesajın içeriği ve anonim göndericinin kimliği asla gösterilmez.</Text>
        </View>

        {notice && (
          <View style={[styles.notice, { backgroundColor: colors.muted, borderColor: notice.kind === "error" ? colors.destructive : colors.border }]} accessibilityLiveRegion="polite">
            <Feather name={notice.kind === "error" ? "alert-circle" : "check-circle"} size={16} color={notice.kind === "error" ? colors.destructive : colors.primary} />
            <Text style={[styles.sub, { color: colors.foreground, flex: 1, marginTop: 0 }]}>{notice.text}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary, opacity: !dirty || busy ? 0.5 : 1 }]}
          onPress={save}
          disabled={!dirty || busy}
          testID="push-save"
        >
          {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Kaydet</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, { borderWidth: 1, borderColor: colors.border, opacity: !settings.enabled || dirty || busy ? 0.5 : 1 }]}
          onPress={test}
          disabled={!settings.enabled || dirty || busy}
          testID="push-test"
        >
          {testing ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.btnText, { color: colors.foreground }]}>Test Bildirimi Gönder</Text>}
        </TouchableOpacity>
        <Text style={[styles.sub, { color: colors.mutedForeground, textAlign: "center" }]}>
          {dirty ? "Test için önce değişiklikleri kaydet." : "Test isteğinin kabul edilmesi, bildirimin telefona ulaşacağı anlamına gelmez."}
        </Text>
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {header}
      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  content: { padding: 20, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 16 },
  desc: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
  card: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  pad: { padding: 16, gap: 6 },
  cardTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sub: { fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { fontSize: 11, letterSpacing: 1, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, minHeight: 36 },
  link: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  privacy: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  notice: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  btn: { minHeight: 48, borderRadius: 12, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  skeleton: { borderRadius: 16 },
});
