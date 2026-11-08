import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SSS_DATA = [
  {
    q: "Spektrum'a nasıl kayıt olabilirim?",
    a: "Giriş Yap / Kayıt Ol ekranından e-posta adresin ve bir takma adla ücretsiz hesap oluşturabilirsin. Google hesabınla da tek tıkla giriş yapabilirsin.",
  },
  {
    q: "Hikaye yazabilmek için ne gerekiyor?",
    a: 'Kayıtlı ve giriş yapmış olman yeterli. "Yaz" sekmesinden yeni hikaye oluşturup bölüm ekleyebilirsin. Bölümler moderasyon incelemesinden geçtikten sonra yayınlanır.',
  },
  {
    q: "Moderasyon süreci ne kadar sürer?",
    a: "İçerikler yapay zeka destekli sistemimizle birkaç dakika içinde incelenir. Onaylanan bölümler hemen yayınlanır. Reddedilen bölümler için gerekçe profil sayfanda görünür.",
  },
  {
    q: "Jeton nedir, ne işe yarar?",
    a: "Jetonlar platformun sanal para birimidir. Ücretli bölümleri açmak için kullanılır. Jetonlar bölüm başına ya da paket hâlinde satın alınabilir.",
  },
  {
    q: "Bir hikayeyi kayıt olmadan okuyabilir miyim?",
    a: "Ücretsiz bölümleri kayıt olmadan okuyabilirsin. Yorum yapmak, beğeni bırakmak ve ücretli bölümlere erişmek için hesap oluşturman gerekir.",
  },
  {
    q: "Şifremi unuttum, ne yapmalıyım?",
    a: 'Giriş ekranında "Şifremi Unuttum" bağlantısına tıkla. E-posta adresine sıfırlama bağlantısı göndereceğiz.',
  },
  {
    q: "Bir içeriği nasıl şikâyet ederim?",
    a: "Hikaye veya bölüm sayfasındaki üç nokta menüsünden 'Şikâyet Et' seçeneğini kullanabilirsin. Şikâyetler moderatörlerimiz tarafından incelenir.",
  },
  {
    q: "Hesabımı kalıcı olarak silmek istiyorum.",
    a: "Profil > Hesap İşlemleri bölümünden hesabını silebilirsin. Bu işlem geri alınamaz ve tüm hikayelerini, yorumlarını siler.",
  },
  {
    q: "Spektrum iOS ve Android'de çalışıyor mu?",
    a: "Evet, Spektrum hem iOS hem de Android cihazlarla tam uyumludur. App Store ve Google Play'den indirebilirsin.",
  },
  {
    q: "Yazar olarak kazanç elde edebilir miyim?",
    a: "Bölümlerini ücretli olarak yayınlayabilirsin. Okuyucuların ödediği jetonların bir kısmı yazara aktarılır. Detaylı bilgi için Yazar Programı sayfamızı incele.",
  },
];

import { useLocale } from "@/contexts/LocaleContext";

function FAQItem({ item }: { item: { q: string; a: string } }) {
  const { t } = useLocale();
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <TouchableOpacity
      style={[s.item, { backgroundColor: colors.card, borderColor: open ? colors.primary + "60" : colors.border }]}
      onPress={toggle}
      activeOpacity={0.8}
    >
      <View style={s.itemHeader}>
        <Text style={[s.question, { color: colors.foreground }]}>{t(item.q)}</Text>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={open ? colors.primary : colors.mutedForeground}
        />
      </View>
      {open && (
        <Text style={[s.answer, { color: colors.mutedForeground }]}>{t(item.a)}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function SSSScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Sık Sorulan Sorular</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
          Aklında bir soru mu var? Cevabı burada bulabilirsin.
        </Text>
        {SSS_DATA.map((item, i) => (
          <FAQItem key={i} item={item} />
        ))}
        <View style={[s.footer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="help-circle" size={20} color={colors.primary} />
          <Text style={[s.footerText, { color: colors.mutedForeground }]}>
            Yanıtını bulamadın mı?{" "}
            <Text
              style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}
              onPress={() => router.push("/iletisim")}
            >
              Bize yaz
            </Text>
            .
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
  content: { padding: 16, gap: 10 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 6 },
  item: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 0 },
  itemHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  question: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  answer: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, marginTop: 10 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  footerText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
