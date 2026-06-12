import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import {
  listenMessages,
  sendMessage,
  markConversationRead,
  isMutuallyBlocked,
  Message,
} from "@/lib/firestore-service";
import { uploadMessageMedia } from "@/lib/storage-service";
import { checkImageSafety } from "@/lib/moderation-service";

const EMOJIS = ["😂", "❤️", "🔥", "👏", "😭", "🙌", "✨", "💜", "🎉", "😍", "🤩", "💯"];

function timeStr(ts?: { seconds: number }): string {
  if (!ts) return "";
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { id, otherName, otherUid } = useLocalSearchParams<{
    id: string;
    otherName: string;
    otherUid: string;
  }>();

  const convId = Array.isArray(id) ? id[0] : id;
  const recipientName = Array.isArray(otherName) ? otherName[0] : (otherName ?? "Kullanıcı");
  const recipientUid = Array.isArray(otherUid) ? otherUid[0] : (otherUid ?? "");

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const flatListRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    if (!convId) return;
    if (user) markConversationRead(convId, user.uid).catch(() => {});
    const unsub = listenMessages(convId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
    return () => unsub();
  }, [convId, user]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const checkSendBlocked = async (): Promise<boolean> => {
    if (!user || !profile) return true;
    if (profile.banned) {
      Alert.alert("Hesabın Askıya Alındı", profile.banReason || "Askıya alınan hesaplar mesaj gönderemez.");
      return true;
    }
    if (recipientUid) {
      const blocked = await isMutuallyBlocked(user.uid, recipientUid).catch(() => false);
      if (blocked) {
        Alert.alert("Mesaj Gönderilemedi", "Bu kullanıcıyla mesajlaşma engelli.");
        return true;
      }
    }
    return false;
  };

  const handleSend = async () => {
    if (!text.trim() || !user || !profile || !convId) return;
    if (await checkSendBlocked()) return;
    const trimmed = text.trim();
    setText("");
    setShowEmoji(false);
    setSending(true);
    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      conversationId: convId,
      senderId: user.uid,
      senderName: profile.displayName,
      senderAvatar: profile.avatarUrl ?? "",
      text: trimmed,
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await sendMessage(convId, {
        senderId: user.uid,
        senderName: profile.displayName,
        senderAvatar: profile.avatarUrl ?? "",
        text: trimmed,
        receiverId: recipientUid,
      });
    } catch { /* onSnapshot günceller */ }
    finally { setSending(false); }
  };

  const handlePickImage = async () => {
    if (!user || !profile || !convId) return;
    if (await checkSendBlocked()) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("İzin Gerekli", "Fotoğraf göndermek için galeri iznine ihtiyaç var.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    setSending(true);
    try {
      const asset = result.assets[0];
      const check = await checkImageSafety({
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        uri: asset.uri,
      });
      if (!check.safe && check.action === "rejected") {
        Alert.alert("Görsel Uygun Değil", check.reason ?? "Bu görsel gönderilemez.");
        return;
      }
      const url = await uploadMessageMedia(convId, asset.uri);
      await sendMessage(convId, {
        senderId: user.uid,
        senderName: profile.displayName,
        senderAvatar: profile.avatarUrl ?? "",
        text: "",
        mediaUrl: url,
        mediaType: "image",
        receiverId: recipientUid,
      });
    } catch {
      Alert.alert("Hata", "Fotoğraf gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item: msg }: { item: Message }) => {
    const isMe = msg.senderId === user?.uid;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        <View
          style={[
            styles.bubble,
            isMe
              ? [styles.bubbleMe, { backgroundColor: colors.primary }]
              : [styles.bubbleOther, { backgroundColor: colors.card, borderColor: colors.border }],
          ]}
        >
          {msg.mediaUrl ? (
            <Image
              source={{ uri: msg.mediaUrl }}
              style={styles.mediaImage}
              resizeMode="cover"
            />
          ) : null}
          {msg.text ? (
            <Text style={[styles.bubbleText, { color: isMe ? "#fff" : colors.foreground }]}>
              {msg.text}
            </Text>
          ) : null}
          <Text style={[styles.bubbleTime, { color: isMe ? "rgba(255,255,255,0.6)" : colors.mutedForeground }]}>
            {timeStr(msg.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 4, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.headerAvatar, { backgroundColor: colors.primary + "33" }]}>
          <Text style={[styles.headerAvatarText, { color: colors.primary }]}>
            {recipientName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.headerName, { color: colors.foreground }]} numberOfLines={1}>
          {recipientName}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.list, { paddingBottom: 16 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="message-circle" size={40} color={colors.mutedForeground + "60"} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Henüz mesaj yok. İlk mesajı sen gönder!
              </Text>
            </View>
          }
        />
      )}

      {/* Emoji Picker */}
      {showEmoji && (
        <View style={[styles.emojiPanel, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={styles.emojiGrid}>
            {EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                onPress={() => { setText((t) => t + e); setShowEmoji(false); }}
                style={styles.emojiBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.inputBar,
            { paddingBottom: insets.bottom + 8, backgroundColor: colors.background, borderTopColor: colors.border },
          ]}
        >
          <TouchableOpacity
            onPress={() => setShowEmoji((v) => !v)}
            style={styles.iconBtn}
            activeOpacity={0.7}
          >
            <Feather name="smile" size={22} color={showEmoji ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handlePickImage}
            style={styles.iconBtn}
            activeOpacity={0.7}
            disabled={sending}
          >
            <Feather name="image" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Mesajını yaz..."
            placeholderTextColor={colors.mutedForeground}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: (text.trim() && !sending) ? colors.primary : colors.muted }]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Feather name="send" size={18} color={text.trim() ? "#fff" : colors.mutedForeground} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { padding: 6 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  headerName: { fontSize: 16, fontFamily: "Inter_600SemiBold", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyText: { fontSize: 14, textAlign: "center", fontFamily: "Inter_400Regular" },
  list: { paddingHorizontal: 12, paddingTop: 12, gap: 4 },
  msgRow: { flexDirection: "row", marginVertical: 4 },
  msgRowMe: { justifyContent: "flex-end" },
  bubble: { maxWidth: "75%", borderRadius: 18, padding: 10, gap: 4 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleOther: { borderWidth: 1, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bubbleTime: { fontSize: 10, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  mediaImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
  emojiPanel: { borderTopWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  emojiBtn: { padding: 6 },
  emojiText: { fontSize: 26 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 10, paddingTop: 10, borderTopWidth: 1, gap: 8 },
  iconBtn: { padding: 6, alignSelf: "flex-end", marginBottom: 2 },
  input: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
});
