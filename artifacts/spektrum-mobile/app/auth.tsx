import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { GoogleSignin, isErrorWithCode, statusCodes } from "@react-native-google-signin/google-signin";
import { loginUser, loginWithGoogleCredential, registerUser, resetPassword } from "@/lib/auth-service";
import { useColors } from "@/hooks/useColors";
import { useLocale } from "@/contexts/LocaleContext";
import { LanguagePicker } from "@/components/LanguagePicker";

type Tab = "login" | "register" | "forgot";

const GENDERS = ["Kadın", "Erkek", "Belirtmek istemiyorum"];

export default function AuthScreen() {
  const colors = useColors();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState(GENDERS[2]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [kvkkAcknowledged, setKvkkAcknowledged] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("E-posta adresini gir.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await resetPassword(email.trim());
      Alert.alert(t("Gönderildi"), t("Şifre sıfırlama bağlantısı e-postana gönderildi."));
      setTab("login");
    } catch {
      setError("E-posta gönderilemedi. Adresi kontrol et.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("E-posta ve şifre boş olamaz.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await loginUser(email.trim(), password);
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (e: any) {
      const code = e?.code ?? "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setError("E-posta veya şifre hatalı.");
      } else if (code === "auth/user-not-found") {
        setError("Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.");
      } else if (code === "auth/too-many-requests") {
        setError("Çok fazla deneme. Bir süre bekle.");
      } else {
        setError(e?.message ?? "Giriş yapılamadı.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password.trim() || !displayName.trim()) {
      setError("Tüm alanları doldurun.");
      return;
    }
    if (!termsAccepted || !kvkkAcknowledged) {
      setError("Kayıt olmak için Kullanıcı Sözleşmesi'ni ve KVKK Aydınlatma Metni'ni onaylamalısın.");
      return;
    }
    if (!birthDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setError("Doğum tarihi YYYY-AA-GG formatında girin.");
      return;
    }
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await registerUser(email.trim(), password, displayName.trim(), birthDate, gender, {
        termsAccepted,
        kvkkAcknowledged,
      });
      Alert.alert(
        "Kayıt başarılı!",
        "E-posta adresine bir doğrulama linki gönderdik. E-postanı doğruladıktan sonra giriş yapabilirsin.",
        [{ text: "Tamam", onPress: () => router.canGoBack() ? router.back() : router.replace("/") }]
      );
    } catch (e: any) {
      const code = e?.code ?? "";
      if (code === "auth/email-already-in-use") {
        setError("Bu e-posta adresi zaten kullanımda.");
      } else if (code === "auth/nickname-taken") {
        setError("Bu takma ad zaten alınmış. Farklı bir isim dene.");
      } else if (code === "auth/underage") {
        setError("13 yaşından küçük kullanıcılar kayıt olamaz.");
      } else {
        setError(e?.message ?? "Kayıt yapılamadı.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (Platform.OS !== "android") {
      setError("Google ile giriş şu anda yalnızca Android uygulamasında kullanılabilir.");
      return;
    }
    const webClientId =
      Constants.expoConfig?.extra?.googleWebClientId ??
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (typeof webClientId !== "string" || !webClientId.trim()) {
      setError("Google girişi yapılandırılmamış. Lütfen uygulamayı güncelledikten sonra tekrar dene.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      GoogleSignin.configure({ webClientId, offlineAccess: false });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (response.type === "cancelled") return;
      const idToken = response.data.idToken;
      if (!idToken) {
        setError("Google kimlik doğrulama bilgisi alınamadı. Lütfen tekrar dene.");
        return;
      }
      await loginWithGoogleCredential(idToken);
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (e: unknown) {
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError("Google Play Hizmetleri güncel değil veya kullanılamıyor. Güncelleyip tekrar dene.");
      } else if (isErrorWithCode(e) && (e.code === "10" || e.code === "DEVELOPER_ERROR")) {
        setError("Google girişi için Play uygulama imzalama SHA-1 değerinin Firebase Android uygulamasına eklenmesi ve Google hizmet dosyasının güncellenmesi gerekiyor.");
      } else if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) {
        setError("Google giriş işlemi zaten sürüyor. Lütfen tamamlanmasını bekle.");
      } else {
        setError("Google ile giriş tamamlanamadı. İnternet bağlantını kontrol edip yeniden dene.");
      }
    } finally {
      setLoading(false);
    }
  };

  const s = styles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={["#A07FE622", "#E6A54522", colors.background]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[s.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Başlık */}
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/")} style={s.closeBtn}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>

          <LanguagePicker compact />
          <Text style={s.logo}>SPEKTRUM</Text>
          <Text style={s.subtitle}>
            {tab === "login" ? t("Hesabına giriş yap") : t("Topluluğa katıl")}
          </Text>

          {/* Sekme */}
          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tabBtn, tab === "login" && s.tabBtnActive]}
              onPress={() => { setTab("login"); setError(""); }}
            >
              <Text style={[s.tabText, tab === "login" && s.tabTextActive]}>{t("Giriş Yap")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, tab === "register" && s.tabBtnActive]}
              onPress={() => { setTab("register"); setError(""); }}
            >
              <Text style={[s.tabText, tab === "register" && s.tabTextActive]}>{t("Kayıt Ol")}</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={s.form}>
            {tab === "register" && (
              <View style={s.inputWrapper}>
                <Feather name="user" size={16} color={colors.mutedForeground} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder={t("Takma ad")}
                  placeholderTextColor={colors.mutedForeground}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="none"
                />
              </View>
            )}

            <View style={s.inputWrapper}>
              <Feather name="mail" size={16} color={colors.mutedForeground} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder={t("E-posta")}
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {tab !== "forgot" && (
              <View style={s.inputWrapper}>
                <Feather name="lock" size={16} color={colors.mutedForeground} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder={t("Şifre")}
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={{ padding: 4 }}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            )}

            {tab === "register" && (
              <>
                <View style={s.inputWrapper}>
                  <Feather name="calendar" size={16} color={colors.mutedForeground} style={s.inputIcon} />
                  <TextInput
                    style={s.input}
                    placeholder={t("Doğum tarihi (YYYY-AA-GG)")}
                    placeholderTextColor={colors.mutedForeground}
                    value={birthDate}
                    onChangeText={setBirthDate}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <Text style={s.fieldLabel}>{t("Cinsiyet")}</Text>
                <View style={s.genderRow}>
                  {GENDERS.map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[s.genderBtn, gender === g && s.genderBtnActive]}
                      onPress={() => setGender(g)}
                    >
                      <Text style={[s.genderText, gender === g && s.genderTextActive]}>{t(g)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.consents}>
                  <View style={s.consentRow}>
                    <TouchableOpacity
                      style={[s.checkbox, termsAccepted && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setTermsAccepted((value) => !value)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: termsAccepted }}
                      accessibilityLabel={t("Kullanıcı Sözleşmesi'ni okudum ve onaylıyorum")}
                    >
                      {termsAccepted && <Feather name="check" size={14} color={colors.primaryForeground} />}
                    </TouchableOpacity>
                      <Text style={[s.consentText, { color: colors.mutedForeground }]}>
                      <Text onPress={() => router.push("/terms")} style={{ color: colors.primary }}>{t("Kullanıcı Sözleşmesi")}</Text>
                        {t("'ni okudum ve onaylıyorum.")}
                    </Text>
                  </View>
                  <View style={s.consentRow}>
                    <TouchableOpacity
                      style={[s.checkbox, kvkkAcknowledged && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setKvkkAcknowledged((value) => !value)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: kvkkAcknowledged }}
                      accessibilityLabel={t("KVKK Aydınlatma Metni'ni okudum")}
                    >
                      {kvkkAcknowledged && <Feather name="check" size={14} color={colors.primaryForeground} />}
                    </TouchableOpacity>
                      <Text style={[s.consentText, { color: colors.mutedForeground }]}>
                      <Text onPress={() => router.push("/kvkk")} style={{ color: colors.primary }}>{t("KVKK Aydınlatma Metni")}</Text>
                        {t("'ni okudum ve bilgilendirildim.")}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {tab === "login" && (
              <TouchableOpacity onPress={() => { setError(""); setTab("forgot"); }} style={{ alignSelf: "flex-end", marginTop: -4, marginBottom: 4 }}>
                <Text style={{ color: colors.primary, fontSize: 13 }}>{t("Şifremi unuttum")}</Text>
              </TouchableOpacity>
            )}

            {tab === "forgot" && (
              <TouchableOpacity onPress={() => { setError(""); setTab("login"); }} style={{ alignSelf: "flex-start", marginTop: -4, marginBottom: 4 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{t("← Giriş ekranına dön")}</Text>
              </TouchableOpacity>
            )}

            {!!error && <Text style={s.errorText}>{t(error)}</Text>}

            <TouchableOpacity
              style={[s.submitBtn, loading && { opacity: 0.7 }]}
              onPress={tab === "login" ? handleLogin : tab === "register" ? handleRegister : handleForgotPassword}
              disabled={loading || (tab === "register" && (!termsAccepted || !kvkkAcknowledged))}
            >
              <LinearGradient
                colors={["#A07FE6", "#8B6AC5"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.submitGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.submitText}>{tab === "login" ? t("Giriş Yap") : tab === "register" ? t("Kayıt Ol") : t("Sıfırlama Bağlantısı Gönder")}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Ayraç */}
            {tab !== "forgot" && <View style={s.divider}>
              <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[s.dividerText, { color: colors.mutedForeground }]}>{t("veya")}</Text>
              <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
            </View>}

            {/* Google ile giriş */}
            {tab !== "forgot" && <TouchableOpacity
              style={[s.googleBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: loading ? 0.6 : 1 }]}
              onPress={handleGoogle}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={s.googleLogo}>G</Text>}
              <Text style={[s.googleBtnText, { color: colors.foreground }]}>
                {loading ? t("Google ile bağlanılıyor…") : `${t("Google ile")} ${tab === "login" ? t("Giriş Yap") : t("Kayıt Ol")}`}
              </Text>
            </TouchableOpacity>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { paddingHorizontal: 24 },
    closeBtn: { alignSelf: "flex-end", padding: 8, marginBottom: 8 },
    logo: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.primary,
      letterSpacing: 3,
      textAlign: "center",
      marginBottom: 6,
      fontFamily: "Inter_700Bold",
    },
    subtitle: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginBottom: 28 },
    tabs: {
      flexDirection: "row",
      backgroundColor: colors.muted,
      borderRadius: 12,
      padding: 3,
      marginBottom: 28,
    },
    tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
    tabBtnActive: { backgroundColor: colors.card },
    tabText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    tabTextActive: { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    form: { gap: 12 },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 52,
    },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" },
    fieldLabel: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 4 },
    genderRow: { flexDirection: "row", gap: 8 },
    genderBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    genderBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + "22" },
    genderText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    genderTextActive: { color: colors.primary },
    consents: { gap: 12, marginTop: 4 },
    consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    checkbox: {
      width: 20,
      height: 20,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 5,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    consentText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular" },
    errorText: { fontSize: 13, color: colors.destructive, textAlign: "center", fontFamily: "Inter_400Regular" },
    submitBtn: { marginTop: 8, borderRadius: 14, overflow: "hidden" },
    submitGradient: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
    submitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
    divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
    dividerLine: { flex: 1, height: 1 },
    dividerText: { fontSize: 13, fontFamily: "Inter_400Regular" },
    googleBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
    },
    googleLogo: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: "#4285F4",
    },
    googleBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  });
