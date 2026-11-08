import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

const CONTACT_ITEMS = [
  { icon: "mail", label: "E-posta", value: "destek@spektrum.app", action: () => Linking.openURL("mailto:destek@spektrum.app") },
  { icon: "instagram", label: "Instagram", value: "@spektrum.app", action: () => Linking.openURL("https://instagram.com/spektrum.app") },
  { icon: "twitter", label: "X / Twitter", value: "@spektrumapp", action: () => Linking.openURL("https://twitter.com/spektrumapp") },
];

import { useLocale } from "@/contexts/LocaleContext";

export default function IletisimScreen() {
  const { t } = useLocale();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert("Uyarı", "Konu ve mesaj alanları boş olamaz.");
      return;
    }
    const mailBody = encodeURIComponent(message.trim());
    const mailSubject = encodeURIComponent(subject.trim());
    Linking.openURL(`mailto:destek@spektrum.app?subject=${mailSubject}&body=${mailBody}`);
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>İletişim</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Kanallar */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>Bize Ulaş</Text>
        {CONTACT_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[s.contactRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={item.action}
            activeOpacity={0.75}
          >
            <View style={[s.iconWrap, { backgroundColor: colors.primary + "18" }]}>
              <Feather name={item.icon as React.ComponentProps<typeof Feather>["name"]} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.contactLabel, { color: colors.mutedForeground }]}>{t(item.label)}</Text>
              <Text style={[s.contactValue, { color: colors.foreground }]}>{item.value}</Text>
            </View>
            <Feather name="external-link" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}

        {/* Form */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>Mesaj Gönder</Text>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.label, { color: colors.mutedForeground }]}>Konu</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Mesajının konusu..."
            placeholderTextColor={colors.mutedForeground}
            style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <Text style={[s.label, { color: colors.mutedForeground }]}>Mesaj</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Bize ne söylemek istiyorsun?"
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={5}
            style={[s.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: colors.primary }]}
            onPress={handleSend}
            activeOpacity={0.8}
          >
            <Feather name="send" size={16} color="#fff" />
            <Text style={s.sendBtnText}>Gönder</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="clock" size={16} color={colors.mutedForeground} />
          <Text style={[s.infoText, { color: colors.mutedForeground }]}>
            Mesajlarınıza en geç 2 iş günü içinde yanıt vermeye çalışıyoruz.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 14 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 4 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  contactLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  contactValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 8 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 110,
    textAlignVertical: "top",
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 4,
  },
  sendBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
});
