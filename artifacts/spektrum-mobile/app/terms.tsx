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
    title: "1. Kabul ve Kapsam",
    content:
      "Bu Kullanıcı Sözleşmesi, SPEKTRUM mobil uygulamasını ('Uygulama') kullanımınızı düzenler. Uygulamayı indirerek veya kullanarak bu sözleşmenin tüm koşullarını kabul etmiş sayılırsınız. Kabul etmiyorsanız lütfen uygulamayı kullanmayın.",
  },
  {
    title: "2. Hesap Oluşturma",
    content:
      "• Gerçek ve doğru bilgiler sağlamakla yükümlüsünüz.\n• Hesabınızın güvenliğini sağlamak sizin sorumluluğunuzdadır.\n• 13 yaşın altındaki kişiler hesap açamaz.\n• Başka bir kişinin kimliğine bürünerek hesap oluşturmak yasaktır.",
  },
  {
    title: "3. Kabul Edilebilir Kullanım",
    content:
      "Aşağıdaki içerikleri yayınlamak kesinlikle yasaktır:\n\n• Müstehcen, pornografik veya cinsel içerikler\n• Şiddet, kin, nefret söylemi barındıran içerikler\n• Uyuşturucu veya uyarıcı madde kullanımını teşvik eden içerikler\n• Çocukların güvenliğini tehdit eden her türlü içerik\n• İntihar veya kendine zarar vermeyi özendiren içerikler\n• Başkalarının fikri mülkiyet haklarını ihlal eden içerikler\n• Yanıltıcı, sahte veya dolandırıcılık amaçlı içerikler\n• Siyasi propaganda veya seçim süreçlerini etkilemeye yönelik içerikler",
  },
  {
    title: "4. İçerik Hakları",
    content:
      "Yayınladığınız içeriklerin telif hakları size aittir. SPEKTRUM'a içeriklerinizi platform dahilinde gösterme, yeniden boyutlandırma ve dağıtma için ücretsiz, dünya genelinde, alt lisanslanabilir bir lisans vermiş olursunuz. İçeriklerinizi herhangi bir zamanda silebilirsiniz.",
  },
  {
    title: "5. Moderasyon ve İçerik Kaldırma",
    content:
      "SPEKTRUM, Topluluk Kurallarımıza aykırı içerikleri önceden bildirimde bulunmaksızın kaldırma hakkını saklı tutar. Tekrarlayan ihlaller hesabın askıya alınmasına veya kalıcı olarak kapatılmasına yol açabilir.",
  },
  {
    title: "6. Jeton Sistemi",
    content:
      "Jetonlar uygulama içi sanal birimlerdir; nakit değeri yoktur ve iade edilmez. Hesabınız kapatıldığında kullanılmamış jetonlarınız silinir. SPEKTRUM, jeton fiyatlarını ve kullanım koşullarını önceden bildirerek değiştirme hakkını saklı tutar.",
  },
  {
    title: "7. Sorumluluk Sınırı",
    content:
      "SPEKTRUM, kullanıcı tarafından oluşturulan içeriklerden sorumlu değildir. Uygulama 'olduğu gibi' sunulmakta olup hizmet kesintileri için garanti verilmemektedir. Yasal olarak izin verilen azami ölçüde, dolaylı veya sonuç olarak ortaya çıkan zararlardan sorumluluk kabul edilmemektedir.",
  },
  {
    title: "8. Fikri Mülkiyet",
    content:
      "SPEKTRUM markası, logosu, uygulama tasarımı ve yazılımı SPEKTRUM'un fikri mülkiyetidir. Kaynak gösterilmeksizin kopyalanamaz, dağıtılamaz veya ticari amaçla kullanılamaz.",
  },
  {
    title: "9. Hesap Fesih",
    content:
      "İstediğiniz zaman hesabınızı silebilirsiniz. SPEKTRUM, sözleşme ihlali durumunda hesabınızı askıya alabilir veya kalıcı olarak silebilir. Hesap silindiğinde yayınlanmış içerikleriniz de kaldırılır.",
  },
  {
    title: "10. Uygulanacak Hukuk",
    content:
      "Bu sözleşme Türkiye Cumhuriyeti hukukuna tâbidir. Uyuşmazlıklarda İstanbul Mahkemeleri yetkilidir.",
  },
  {
    title: "11. Değişiklikler",
    content:
      "Bu sözleşme zaman zaman güncellenebilir. Önemli değişiklikler uygulama içi bildirimle duyurulur. Değişikliklerden sonra uygulamayı kullanmaya devam etmeniz, yeni koşulları kabul ettiğiniz anlamına gelir.\n\nSon güncelleme: Haziran 2025.",
  },
];

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Kullanıcı Sözleşmesi</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.heroBanner, { backgroundColor: "#f59e0b12", borderColor: "#f59e0b30" }]}>
          <Text style={s.heroIcon}>📋</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.heroTitle, { color: colors.foreground }]}>SPEKTRUM Kullanım Koşulları</Text>
            <Text style={[s.heroSub, { color: colors.mutedForeground }]}>
              Lütfen platformu kullanmadan önce bu koşulları dikkatlice okuyun.
            </Text>
          </View>
        </View>

        {SECTIONS.map((sec, i) => (
          <View key={i} style={[s.section, { borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.primary }]}>{sec.title}</Text>
            <Text style={[s.sectionContent, { color: colors.foreground }]}>{sec.content}</Text>
          </View>
        ))}

        <View style={[s.contactBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="mail" size={18} color={colors.mutedForeground} />
          <Text style={[s.contactText, { color: colors.mutedForeground }]}>
            Sorularınız için: <Text style={{ color: colors.primary }}>destek@spektrum.app</Text>
          </Text>
        </View>
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
  contactBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 4 },
  contactText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
