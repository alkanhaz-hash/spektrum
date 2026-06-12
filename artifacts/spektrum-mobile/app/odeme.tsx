import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { JETON_PACKAGES } from "@/lib/jeton-packages";

const PAYMENT_API_BASE = process.env.EXPO_PUBLIC_PAYMENT_API_URL ?? "";
const REDIRECT_SCHEME = "spektrum://payment/result";

export default function OdemeScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ packageId: string }>();

  const pkg = JETON_PACKAGES.find(p => p.id === params.packageId);
  const [loading, setLoading] = useState(false);

  if (!pkg) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Paket bulunamadı</Text>
        <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontSize: 14 }}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const startPayment = async () => {
    if (!user) {
      Alert.alert("Giriş Gerekli", "Ödeme yapmak için giriş yapman gerekiyor.");
      return;
    }

    if (!PAYMENT_API_BASE) {
      Alert.alert(
        "Ödeme Sistemi Yakında",
        "PayTR/İyzico entegrasyonu hazırlanıyor. Yakında aktif olacak!",
        [{ text: "Tamam" }]
      );
      return;
    }

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${PAYMENT_API_BASE}/payment/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageId: pkg.id,
          jetonAmount: pkg.totalJeton,
          priceTRY: pkg.priceTRY,
        }),
      });

      if (!res.ok) {
        throw new Error(`Sunucu hatası: ${res.status}`);
      }

      const { paymentUrl } = (await res.json()) as { paymentUrl: string };

      const result = await WebBrowser.openAuthSessionAsync(paymentUrl, REDIRECT_SCHEME);

      if (result.type === "success" && result.url.includes("status=success")) {
        Alert.alert(
          "Ödeme Başarılı! 🎉",
          `${pkg.totalJeton.toLocaleString("tr")} jeton hesabına eklendi.`,
          [{ text: "Harika!", onPress: () => router.back() }]
        );
      } else if (result.type === "success" && result.url.includes("status=fail")) {
        Alert.alert("Ödeme Başarısız", "Ödeme tamamlanamadı. Tekrar dene.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      Alert.alert("Hata", `Ödeme başlatılamadı: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Ödeme</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={s.body}>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: pkg.popular ? colors.primary : colors.border }]}>
          {pkg.popular && (
            <View style={[s.badge, { backgroundColor: colors.primary }]}>
              <Text style={s.badgeText}>🔥 Popüler</Text>
            </View>
          )}

          <Text style={[s.pkgLabel, { color: colors.foreground }]}>{pkg.label} Paket</Text>

          <View style={s.jetonRow}>
            <Text style={s.zapIcon}>⚡</Text>
            <Text style={[s.jetonAmount, { color: colors.primary }]}>
              {pkg.jetonAmount.toLocaleString("tr")} Jeton
            </Text>
            {pkg.bonusAmount > 0 && (
              <View style={[s.bonusChip, { backgroundColor: "#22c55e20" }]}>
                <Text style={s.bonusText}>+{pkg.bonusAmount} bonus</Text>
              </View>
            )}
          </View>

          {pkg.bonusAmount > 0 && (
            <Text style={[s.totalText, { color: colors.mutedForeground }]}>
              Toplam: {pkg.totalJeton.toLocaleString("tr")} jeton
            </Text>
          )}

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          <Text style={[s.priceLabel, { color: colors.mutedForeground }]}>Ödenecek Tutar</Text>
          <Text style={[s.price, { color: colors.foreground }]}>
            {pkg.priceTRY != null ? `₺${pkg.priceTRY}` : "Yakında"}
          </Text>
          {pkg.unitPriceTRY != null && (
            <Text style={[s.unitPrice, { color: colors.mutedForeground }]}>
              Birim fiyat: ₺{pkg.unitPriceTRY}/jeton
            </Text>
          )}
        </View>

        <View style={[s.secureBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="shield" size={16} color="#22c55e" />
          <Text style={[s.secureText, { color: colors.mutedForeground }]}>
            Ödeme bilgilerin şifrelenir ve güvende tutulur. PayTR veya İyzico altyapısı kullanılır.
          </Text>
        </View>

        <TouchableOpacity
          style={[
            s.payBtn,
            { backgroundColor: pkg.priceTRY != null ? colors.primary : colors.border },
            loading && { opacity: 0.7 },
          ]}
          onPress={startPayment}
          disabled={loading || pkg.priceTRY == null}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="credit-card" size={18} color="#fff" />
              <Text style={s.payBtnText}>
                {pkg.priceTRY != null ? "Güvenli Ödemeye Geç" : "Yakında Açılacak"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[s.cancelText, { color: colors.mutedForeground }]}>
          İptal etmek için geri dön — hiçbir ücret alınmaz.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 24, gap: 16 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 8, overflow: "hidden" },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 4 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  pkgLabel: { fontSize: 22, fontFamily: "Inter_700Bold" },
  jetonRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  zapIcon: { fontSize: 22 },
  jetonAmount: { fontSize: 26, fontFamily: "Inter_700Bold" },
  bonusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  bonusText: { color: "#22c55e", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  totalText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  divider: { height: 1, marginVertical: 4 },
  priceLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  price: { fontSize: 36, fontFamily: "Inter_700Bold" },
  unitPrice: { fontSize: 12, fontFamily: "Inter_400Regular" },
  secureBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  secureText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  payBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16, borderRadius: 16,
  },
  payBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  cancelText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  backBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
