import { useState } from "react";
import { ActivityIndicator, Alert, Modal, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { deleteAccount, freezeAccount } from "@/lib/auth-service";
import { useLocale } from "@/contexts/LocaleContext";
import { LanguagePicker } from "@/components/LanguagePicker";

type Action = "freeze" | "delete" | null;

export default function HesapAyarlariScreen() {
  const colors = useColors();
  const { t } = useLocale();
  const { user } = useAuth();
  const [action, setAction] = useState<Action>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    setAction(null);
    setPassword("");
  };

  const submit = async () => {
    if (!action || !password) return;
    setSubmitting(true);
    try {
      if (action === "freeze") {
        await freezeAccount(password);
        Alert.alert(t("Hesap donduruldu"), t("Tekrar giriş yaptığında hesabın otomatik olarak etkinleşecek."));
      } else {
        await deleteAccount(password);
        Alert.alert(t("Hesap silindi"), t("Hesabın kalıcı olarak silindi."));
      }
      setAction(null);
      setPassword("");
      router.replace("/auth");
    } catch (error) {
      Alert.alert(t("İşlem başarısız"), error instanceof Error ? t(error.message) : t("Şifreni kontrol edip tekrar dene."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.empty}>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>{t("Hesap ayarlarını açmak için giriş yapmalısın.")}</Text>
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => router.replace("/auth")}>
            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{t("Giriş Yap")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("Hesap Ayarları")}</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>{t("Hesabını geçici olarak dondurabilir veya kalıcı olarak silebilirsin.")}</Text>
        <LanguagePicker />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => router.push("/push-settings" as any)} testID="open-push-settings">
            <View style={[styles.icon, { backgroundColor: colors.muted }]}>
              <Feather name="bell" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: colors.foreground }]}>{t("Push Bildirimleri")}</Text>
              <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>{t("Bu telefon için bildirim tercihleri")}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => setAction("freeze")}>
            <View style={[styles.icon, { backgroundColor: colors.muted }]}>
              <Feather name="pause-circle" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: colors.foreground }]}>{t("Hesabı Dondur")}</Text>
              <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>{t("Tekrar giriş yapana kadar hesabın devre dışı kalır")}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => setAction("delete")}>
            <View style={[styles.icon, { backgroundColor: colors.muted }]}>
              <Feather name="trash-2" size={20} color={colors.destructive} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: colors.destructive }]}>{t("Hesabı Kalıcı Olarak Sil")}</Text>
              <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>{t("Bu işlem geri alınamaz")}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={action !== null} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{action === "freeze" ? t("Hesabı Dondur") : t("Hesabı Kalıcı Sil")}</Text>
            <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
              {action === "freeze" ? t("Tekrar giriş yaptığında hesabın otomatik etkinleşir.") : t("Bu işlem geri alınamaz.")} {t("Onaylamak için mevcut şifreni gir.")}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={password}
              onChangeText={setPassword}
              placeholder={t("Mevcut şifren")}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              editable={!submitting}
            />
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.actionButton, { borderColor: colors.border }]} onPress={close} disabled={submitting}>
                <Text style={[styles.label, { color: colors.foreground }]}>{t("Vazgeç")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: action === "delete" ? colors.destructive : colors.primary }]} onPress={submit} disabled={!password || submitting}>
                {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.label, { color: colors.primaryForeground }]}>{action === "freeze" ? t("Dondur") : t("Sil")}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  content: { padding: 20, gap: 18 },
  description: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
  card: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  subLabel: { fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular", marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 16 },
  primaryButton: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  primaryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 22 },
  modalCard: { width: "100%", borderWidth: 1, borderRadius: 18, padding: 20 },
  modalTitle: { fontSize: 19, fontFamily: "Inter_700Bold", marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16, fontSize: 14 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});