import React, { useState } from "react";
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
import { loginUser, registerUser } from "@/lib/auth-service";
import { useColors } from "@/hooks/useColors";

type Tab = "login" | "register";

const GENDERS = ["Kadın", "Erkek", "Belirtmek istemiyorum"];

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState(GENDERS[2]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("E-posta ve şifre boş olamaz.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await loginUser(email.trim(), password);
      router.back();
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
      await registerUser(email.trim(), password, displayName.trim(), birthDate, gender);
      Alert.alert(
        "Kayıt başarılı!",
        "E-posta adresine bir doğrulama linki gönderdik. E-postanı doğruladıktan sonra giriş yapabilirsin.",
        [{ text: "Tamam", onPress: () => router.back() }]
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

  const s = styles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={["#7c3aed22", "#06b6d422", colors.background]}
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
          <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>

          <Text style={s.logo}>SPEKTRUM</Text>
          <Text style={s.subtitle}>
            {tab === "login" ? "Hesabına giriş yap" : "Topluluğa katıl"}
          </Text>

          {/* Sekme */}
          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tabBtn, tab === "login" && s.tabBtnActive]}
              onPress={() => { setTab("login"); setError(""); }}
            >
              <Text style={[s.tabText, tab === "login" && s.tabTextActive]}>Giriş Yap</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, tab === "register" && s.tabBtnActive]}
              onPress={() => { setTab("register"); setError(""); }}
            >
              <Text style={[s.tabText, tab === "register" && s.tabTextActive]}>Kayıt Ol</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={s.form}>
            {tab === "register" && (
              <View style={s.inputWrapper}>
                <Feather name="user" size={16} color={colors.mutedForeground} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Takma ad"
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
                placeholder="E-posta"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={s.inputWrapper}>
              <Feather name="lock" size={16} color={colors.mutedForeground} style={s.inputIcon} />
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Şifre"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={{ padding: 4 }}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {tab === "register" && (
              <>
                <View style={s.inputWrapper}>
                  <Feather name="calendar" size={16} color={colors.mutedForeground} style={s.inputIcon} />
                  <TextInput
                    style={s.input}
                    placeholder="Doğum tarihi (YYYY-AA-GG)"
                    placeholderTextColor={colors.mutedForeground}
                    value={birthDate}
                    onChangeText={setBirthDate}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <Text style={s.fieldLabel}>Cinsiyet</Text>
                <View style={s.genderRow}>
                  {GENDERS.map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[s.genderBtn, gender === g && s.genderBtnActive]}
                      onPress={() => setGender(g)}
                    >
                      <Text style={[s.genderText, gender === g && s.genderTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {!!error && <Text style={s.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[s.submitBtn, loading && { opacity: 0.7 }]}
              onPress={tab === "login" ? handleLogin : handleRegister}
              disabled={loading}
            >
              <LinearGradient
                colors={["#7c3aed", "#6d28d9"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.submitGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.submitText}>{tab === "login" ? "Giriş Yap" : "Kayıt Ol"}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
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
    errorText: { fontSize: 13, color: colors.destructive, textAlign: "center", fontFamily: "Inter_400Regular" },
    submitBtn: { marginTop: 8, borderRadius: 14, overflow: "hidden" },
    submitGradient: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
    submitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  });
