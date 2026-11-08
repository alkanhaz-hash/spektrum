import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

const FEATURES = [
  { icon: "book-open", title: "Zengin Hikaye Dünyası", desc: "Fantastikten romance'a, gerilimden şiire on dört farklı türde binlerce Türkçe hikaye." },
  { icon: "users", title: "Canlı Topluluk", desc: "Yazarlara yorum yap, takip et, mesaj at. Gerçek bağlar kur." },
  { icon: "star", title: "Paragraf Yorumları", desc: "Her paragrafın altına fikrlerini ekle. Okuma deneyimini diyaloğa dönüştür." },
  { icon: "shield", title: "Güvenli Alan", desc: "AI destekli moderasyon sistemi ile zararlı içeriklerden arınmış bir platform." },
];

export default function HakkimizdaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Hakkımızda</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={["#A07FE622", "#E6A54522", "transparent"]}
          style={s.hero}
        >
          <Text style={[s.logo, { color: colors.primary }]}>SPEKTRUM</Text>
          <Text style={[s.heroSub, { color: colors.mutedForeground }]}>
            Türkçe dijital hikaye anlatımının yeni adresi
          </Text>
        </LinearGradient>

        {/* Misyon */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.foreground }]}>Misyonumuz</Text>
          <Text style={[s.cardText, { color: colors.mutedForeground }]}>
            Spektrum, Türkçe yazan ve okuyan milyonlarca insanı buluşturmak için doğdu. Yazarların sesini daha geniş kitlelere taşımak, okuyucuların en sevdikleri hikayeleri bulmalarını kolaylaştırmak ve yaratıcı topluluğu büyütmek temel hedefimizdir.
          </Text>
        </View>

        {/* Özellikler */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>Neler Sunuyoruz?</Text>
        {FEATURES.map((f) => (
          <View key={f.icon} style={[s.featureRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.featureIcon, { backgroundColor: colors.primary + "18" }]}>
              <Feather name={f.icon as React.ComponentProps<typeof Feather>["name"]} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.featureTitle, { color: colors.foreground }]}>{f.title}</Text>
              <Text style={[s.featureDesc, { color: colors.mutedForeground }]}>{f.desc}</Text>
            </View>
          </View>
        ))}

        {/* Versiyon */}
        <Text style={[s.version, { color: colors.mutedForeground }]}>Spektrum v1.0 · © 2025 Tüm hakları saklıdır.</Text>
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
  content: { padding: 20, gap: 16 },
  hero: {
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  logo: { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: 4 },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  card: { borderRadius: 16, padding: 18, borderWidth: 1, gap: 10 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 4 },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  featureIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  featureDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  version: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8 },
});
