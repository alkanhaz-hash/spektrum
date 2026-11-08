import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import MobileStatusBar from "@/components/MobileStatusBar";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

export default function DurumlarScreen() {
  const colors = useColors();
  const { user } = useAuth();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground }]}>Durumlar</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>24 saat sonra otomatik kaybolur</Text>
        </View>
      </View>

      {user ? (
        <MobileStatusBar />
      ) : (
        <View style={styles.empty}>
          <Feather name="circle" size={42} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Durum paylaşmak için giriş yapmalısın.</Text>
          <TouchableOpacity style={[styles.loginButton, { backgroundColor: colors.primary }]} onPress={() => router.push("/auth")}>
            <Text style={[styles.loginText, { color: colors.primaryForeground }]}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  loginButton: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  loginText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});