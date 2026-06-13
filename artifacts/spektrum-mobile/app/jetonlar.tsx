import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import {
  getJetonBalance,
  subscribeJetonTransactions,
  recordIapPurchase,
  type JetonTransaction,
} from "@/lib/firestore-service";
import {
  JETON_PACKAGES,
  JETON_COSTS,
  WORDS_PER_JETON,
  MIN_CHAPTER_COST,
  type JetonPackage,
} from "@/lib/jeton-packages";
import { useIap, type Purchase } from "@/lib/iap-service";

// ─── İşlem tipi etiketi ───────────────────────────────────────────────────────

function txLabel(tx: JetonTransaction): string {
  if (tx.type === "earn") return "+" + tx.amount + " ⚡";
  if (tx.type === "refund") return "+" + tx.amount + " ⚡ (iade)";
  return "-" + tx.amount + " ⚡";
}

function txColor(tx: JetonTransaction, colors: ReturnType<typeof useColors>): string {
  return tx.type === "earn" || tx.type === "refund" ? "#22c55e" : "#ef4444";
}

function formatDate(ts: JetonTransaction["createdAt"]): string {
  try {
    const d = ts?.toDate?.();
    if (!d) return "";
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

// ─── Ana ekran ────────────────────────────────────────────────────────────────

export default function JetonlarScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, profile } = useAuth();

  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<JetonTransaction[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [tab, setTab] = useState<"market" | "history">("market");

  // IAP satın alma başarı handler'ı
  const handlePurchaseSuccess = useCallback(
    async (pkg: JetonPackage, purchase: Purchase) => {
      if (!user) return;
      await recordIapPurchase({
        uid: user.uid,
        packageId: pkg.id,
        productId: pkg.productId,
        totalJeton: pkg.totalJeton,
        orderId: purchase.transactionId ?? purchase.productId,
      });
      setBalance(prev => prev + pkg.totalJeton);
      Alert.alert(
        "Satın Alma Başarılı! 🎉",
        `${pkg.totalJeton.toLocaleString("tr")} jeton hesabına eklendi.`,
        [{ text: "Harika!" }]
      );
    },
    [user]
  );

  const { status: iapStatus, purchasePackage, getPriceFor } = useIap(handlePurchaseSuccess);

  useEffect(() => {
    if (!user) return;
    getJetonBalance(user.uid)
      .then(b => { setBalance(b); setLoadingBalance(false); })
      .catch(() => setLoadingBalance(false));
    return subscribeJetonTransactions(user.uid, setTransactions);
  }, [user]);

  if (!user || !profile) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Feather name="lock" size={40} color={colors.mutedForeground} />
        <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Giriş yapman gerekiyor</Text>
        <TouchableOpacity
          style={[s.loginBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/auth")}
        >
          <Text style={s.loginBtnText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPurchasing = iapStatus === "purchasing";

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* Başlık */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Jetonlar</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Bakiye kartı */}
      <View style={[s.balanceCard, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}>
        <View style={[s.balanceIconWrap, { backgroundColor: colors.primary + "22" }]}>
          <Text style={s.balanceIcon}>⚡</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.balanceLabel, { color: colors.mutedForeground }]}>Mevcut Bakiye</Text>
          {loadingBalance ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={[s.balanceValue, { color: colors.foreground }]}>
              {balance.toLocaleString("tr")} <Text style={{ color: colors.primary }}>Jeton</Text>
            </Text>
          )}
        </View>
        <Feather name="zap" size={28} color={colors.primary + "60"} />
      </View>

      {/* Sekmeler */}
      <View style={[s.tabs, { borderColor: colors.border }]}>
        {(["market", "history"] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "market" ? "Paketler" : "İşlem Geçmişi"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {tab === "market" && (
          <>
            {/* IAP durum uyarısı */}
            {iapStatus === "error" && (
              <View style={[s.warnBox, { backgroundColor: "#ef444418", borderColor: "#ef444440" }]}>
                <Feather name="wifi-off" size={14} color="#ef4444" />
                <Text style={[s.warnText, { color: "#ef4444" }]}>
                  Google Play'e bağlanılamadı. İnternet bağlantını kontrol et.
                </Text>
              </View>
            )}

            <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="info" size={16} color={colors.mutedForeground} style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                Her {WORDS_PER_JETON} kelime = 1 jeton. Minimum bölüm maliyeti {MIN_CHAPTER_COST} jetondur.
              </Text>
            </View>

            {/* Paket kartları */}
            {JETON_PACKAGES.map(pkg => {
              const livePrice = getPriceFor(pkg.productId);
              const displayPrice = livePrice ?? `₺${pkg.priceTRY}`;
              const canBuy = iapStatus === "ready" || iapStatus === "purchasing";

              return (
                <View
                  key={pkg.id}
                  style={[
                    s.packageCard,
                    { backgroundColor: colors.card, borderColor: pkg.popular ? colors.primary : colors.border },
                  ]}
                >
                  {pkg.popular && (
                    <View style={[s.popularBadge, { backgroundColor: colors.primary }]}>
                      <Text style={s.popularBadgeText}>🔥 Popüler</Text>
                    </View>
                  )}
                  <View style={s.packageRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.packageLabel, { color: colors.foreground }]}>{pkg.label}</Text>
                      <Text style={[s.packageJeton, { color: colors.primary }]}>
                        ⚡ {pkg.totalJeton.toLocaleString("tr")} Jeton
                        {pkg.bonusAmount > 0 && (
                          <Text style={[s.packageBonus, { color: "#22c55e" }]}>
                            {" "}(+{pkg.bonusAmount} bonus)
                          </Text>
                        )}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        s.buyBtn,
                        {
                          backgroundColor: pkg.popular ? colors.primary : "transparent",
                          borderColor: pkg.popular ? colors.primary : colors.border,
                          opacity: canBuy ? 1 : 0.5,
                        },
                      ]}
                      activeOpacity={0.7}
                      onPress={() => purchasePackage(pkg)}
                      disabled={!canBuy || isPurchasing}
                    >
                      {isPurchasing && pkg === JETON_PACKAGES.find(p => iapStatus === "purchasing") ? (
                        <ActivityIndicator color={pkg.popular ? "#fff" : colors.foreground} size="small" />
                      ) : (
                        <Text style={[s.buyBtnText, { color: pkg.popular ? "#fff" : colors.foreground }]}>
                          {iapStatus === "connecting" || iapStatus === "fetching"
                            ? "…"
                            : displayPrice}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* Google Play rozeti */}
            <View style={[s.gpBadge, { borderColor: colors.border }]}>
              <Feather name="shield" size={14} color="#22c55e" />
              <Text style={[s.gpText, { color: colors.mutedForeground }]}>
                Ödemeler Google Play tarafından güvence altındadır. Kart bilgilerin hiçbir zaman uygulamaya iletilmez.
              </Text>
            </View>

            {/* Harcama tablosu */}
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Jeton Kullanım Alanları</Text>
            <View style={[s.costTable, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { label: "Hikaye Öne Çıkar (24s)", cost: JETON_COSTS.STORY_BOOST },
                { label: "Profil Rozeti Aç", cost: JETON_COSTS.PROFILE_BADGE },
                { label: "Yazara Bahşiş (Küçük)", cost: JETON_COSTS.TIP_WRITER_SMALL },
                { label: "Yazara Bahşiş (Orta)", cost: JETON_COSTS.TIP_WRITER_MEDIUM },
                { label: "Yazara Bahşiş (Büyük)", cost: JETON_COSTS.TIP_WRITER_LARGE },
              ].map((row, i, arr) => (
                <View
                  key={row.label}
                  style={[s.costRow, i < arr.length - 1 && { borderBottomWidth: 1, borderColor: colors.border }]}
                >
                  <Text style={[s.costLabel, { color: colors.foreground }]}>{row.label}</Text>
                  <Text style={[s.costValue, { color: colors.primary }]}>⚡ {row.cost}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {tab === "history" && (
          <>
            {transactions.length === 0 ? (
              <View style={s.emptyWrap}>
                <Feather name="clock" size={40} color={colors.mutedForeground + "60"} />
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Henüz işlem yok</Text>
              </View>
            ) : (
              transactions.map(tx => (
                <View
                  key={tx.id}
                  style={[s.txRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={[s.txDot, { backgroundColor: tx.type === "spend" ? "#ef444422" : "#22c55e22" }]}>
                    <Feather
                      name={tx.type === "spend" ? "minus-circle" : "plus-circle"}
                      size={18}
                      color={txColor(tx, colors)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.txReason, { color: colors.foreground }]} numberOfLines={1}>
                      {tx.reason}
                    </Text>
                    <Text style={[s.txDate, { color: colors.mutedForeground }]}>{formatDate(tx.createdAt)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[s.txAmount, { color: txColor(tx, colors) }]}>{txLabel(tx)}</Text>
                    <Text style={[s.txBalance, { color: colors.mutedForeground }]}>
                      Bakiye: {tx.balanceAfter.toLocaleString("tr")}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  balanceCard: { flexDirection: "row", alignItems: "center", gap: 14, margin: 16, padding: 18, borderRadius: 18, borderWidth: 1 },
  balanceIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  balanceIcon: { fontSize: 22 },
  balanceLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 },
  balanceValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  warnBox: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  warnText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  infoBox: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  packageCard: { padding: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden", gap: 4 },
  popularBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 6 },
  popularBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  packageRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  packageLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  packageJeton: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  packageBonus: { fontSize: 13, fontFamily: "Inter_400Regular" },
  buyBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1, minWidth: 100, alignItems: "center", justifyContent: "center" },
  buyBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  gpBadge: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  gpText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 4 },
  costTable: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  costRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13 },
  costLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  costValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  emptyWrap: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  txDot: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  txReason: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  txDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  txBalance: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  loginBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  loginBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
