import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

const SECTIONS = [
  {
    title: "1. Veri Sorumlusu",
    content:
      "SPEKTRUM uygulaması kapsamında işlenen kişisel verilerinizin sorumlusu SPEKTRUM Dijital Yayıncılık'tır. Bu aydınlatma metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) madde 10 uyarınca hazırlanmıştır.",
  },
  {
    title: "2. İşlenen Kişisel Veriler",
    content:
      "Uygulamayı kullandığınızda aşağıdaki veriler işlenmektedir:\n\n• Kimlik verileri: Ad, kullanıcı adı\n• İletişim verileri: E-posta adresi\n• Kullanım verileri: Okunan hikayeler, yorumlar, mesajlar\n• Teknik veriler: Cihaz bilgisi, IP adresi, uygulama sürümü\n• Fotoğraf/medya: Profil resmi, kapak görseli, paylaşılan içerikler",
  },
  {
    title: "3. Kişisel Verilerin İşlenme Amaçları",
    content:
      "Kişisel verileriniz şu amaçlarla işlenmektedir:\n\n• Hesap oluşturma ve kimlik doğrulama\n• Platform hizmetlerinin sunulması\n• İçerik moderasyonu ve güvenli kullanım ortamının sağlanması\n• Kişiselleştirilmiş öneri ve keşif hizmetleri\n• Yasal yükümlülüklerin yerine getirilmesi",
  },
  {
    title: "4. Kişisel Verilerin Aktarımı",
    content:
      "Verileriniz; Firebase (Google LLC) altyapısında depolanmakta olup Google'ın gizlilik politikaları çerçevesinde işlenmektedir. Yasal zorunluluk bulunmadıkça üçüncü taraflarla paylaşılmaz.",
  },
  {
    title: "5. Veri Saklama Süreleri",
    content:
      "Hesabınızı silene kadar verileriniz saklanır. Hesap silindiğinde 30 gün içinde ilgili veriler sistemden kaldırılır. Yasal yükümlülük gerektiren veriler mevzuatta öngörülen süreler boyunca saklanmaya devam eder.",
  },
  {
    title: "6. KVKK Kapsamındaki Haklarınız",
    content:
      "KVKK madde 11 uyarınca aşağıdaki haklara sahipsiniz:\n\n• Kişisel verilerinizin işlenip işlenmediğini öğrenme\n• İşlenmişse buna ilişkin bilgi talep etme\n• İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme\n• Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme\n• Eksik veya yanlış işlenmişse düzeltilmesini isteme\n• KVKK'nın 7. maddesinde öngörülen şartlar çerçevesinde silinmesini veya yok edilmesini isteme\n• Düzeltme ve silme işlemlerinin üçüncü kişilere bildirilmesini isteme\n• Otomatik sistemlerle analiz edilmesi nedeniyle aleyhinize çıkan bir sonuca itiraz etme\n• Hukuka aykırı işlenmesi nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme",
  },
  {
    title: "7. İletişim",
    content:
      "Haklarınızı kullanmak için destek@spektrum.app adresine yazabilirsiniz. Başvurularınız en geç 30 gün içinde yanıtlanacaktır.",
  },
  {
    title: "8. Çerez ve Benzeri Teknolojiler",
    content:
      "Mobil uygulama Firebase SDK aracılığıyla analitik ve kimlik doğrulama amaçlı teknik tanımlayıcılar kullanmaktadır. Bu tanımlayıcılar, oturumunuzu sürdürmek ve uygulamanın güvenli çalışmasını sağlamak amacıyla kullanılır.",
  },
  {
    title: "9. Güncellemeler",
    content:
      "Bu metin zaman zaman güncellenebilir. Önemli değişikliklerde uygulama içi bildirim yapılacaktır. Son güncelleme: Haziran 2025.",
  },
];

export default function KVKKScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>KVKK Aydınlatma Metni</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.heroBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
          <Text style={s.heroIcon}>🔐</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.heroTitle, { color: colors.foreground }]}>Gizliliğiniz Önemlidir</Text>
            <Text style={[s.heroSub, { color: colors.mutedForeground }]}>
              SPEKTRUM olarak verilerinizi koruma altına almayı taahhüt ediyoruz.
            </Text>
          </View>
        </View>

        {SECTIONS.map((sec, i) => (
          <View key={i} style={[s.section, { borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.primary }]}>{sec.title}</Text>
            <Text style={[s.sectionContent, { color: colors.foreground }]}>{sec.content}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  heroBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 4 },
  heroIcon: { fontSize: 32 },
  heroTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  heroSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  section: { borderBottomWidth: 1, paddingBottom: 16, paddingTop: 4 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 8 },
  sectionContent: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
