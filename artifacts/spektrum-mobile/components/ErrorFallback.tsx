import { Feather } from "@expo/vector-icons";
import { reloadAppAsync } from "expo";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

// Statik, hook-suz renkler — ErrorFallback'in kendisi hicbir zaman cokmez
const C = {
  bg: "#0B0D14",
  fg: "#E8E4DD",
  muted: "#8A93A8",
  card: "#141722",
  primary: "#A07FE6",
  primaryFg: "#ffffff",
  border: "#232833",
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch {
      resetError();
    }
  };

  // error null-safe: Error degilse bile string ceviri
  const safeMessage =
    error?.message ||
    (typeof error === "string" ? error : null) ||
    error?.toString?.() ||
    "[Bilinmeyen hata — mesaj bulunamadi]";

  const formatErrorDetails = (): string => {
    let details = `Hata: ${safeMessage}\n\n`;
    if (error?.stack) {
      details += `Stack:\n${error.stack}`;
    }
    if (!error?.message && typeof error === "object" && error !== null) {
      try {
        details += `\n\nRaw object:\n${JSON.stringify(error, null, 2)}`;
      } catch {
        details += "\n\n(Raw object JSON'a cevrilemiyor)";
      }
    }
    return details;
  };

  const monoFont = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <Pressable
        onPress={() => setIsModalVisible(true)}
        style={({ pressed }) => [
          styles.topButton,
          { backgroundColor: C.card, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Feather name="alert-circle" size={20} color={C.fg} />
      </Pressable>

      <View style={styles.content}>
        <Text style={[styles.title, { color: C.fg }]}>
          Bir hata olustu
        </Text>

        <Text style={[styles.message, { color: C.muted }]}>
          Lutfen uygulamayi yeniden baslatin.
        </Text>

        {/* HATA MESAJI: Null-safe, her zaman goster */}
        <View style={[styles.errorCard, { backgroundColor: C.card }]}>
          <Text
            style={[
              styles.errorCardText,
              { color: C.muted, fontFamily: monoFont },
            ]}
            selectable
          >
            {safeMessage}
          </Text>
        </View>

        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: C.primary,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: C.primaryFg }]}>
            Yeniden Dene
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: C.bg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: C.border }]}>
              <Text style={[styles.modalTitle, { color: C.fg }]}>
                Hata Detaylari
              </Text>
              <Pressable
                onPress={() => setIsModalVisible(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Feather name="x" size={24} color={C.fg} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator
            >
              <View style={[styles.errorContainer, { backgroundColor: C.card }]}>
                <Text
                  style={[
                    styles.errorText,
                    { color: C.fg, fontFamily: monoFont },
                  ]}
                  selectable
                >
                  {formatErrorDetails()}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
    maxWidth: 600,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 40,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  errorCard: {
    width: "100%",
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  errorCardText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  topButton: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 8,
    paddingHorizontal: 24,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontWeight: "600",
    textAlign: "center",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    height: "90%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
  },
  errorContainer: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    padding: 16,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    width: "100%",
  },
});
