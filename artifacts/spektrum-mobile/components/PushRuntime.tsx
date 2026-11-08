import { useEffect } from "react";
import { AppState } from "react-native";
import { router, useRootNavigationState } from "expo-router";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "@/contexts/AuthContext";
import { nativeNotifications, pushSupport, syncPushRegistration } from "@/lib/push-notifications";
import { pushDestination } from "@/lib/push-routing";
import { getPublicShareUrl } from "@/lib/share-links";
import { auth } from "@/lib/firebase";

// Cold-start taps can arrive before Firebase restores auth; defer instead of losing the tap.
let pending: Record<string, unknown> | null = null;
let lastResponse = "";
export function PushRuntime() {
  const { user, loading } = useAuth();
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (!pushSupport().supported || loading || !navigation?.key) return;
    let alive = true;
    const cleanup: (() => void)[] = [];
    const sync = () => { void syncPushRegistration().catch(() => console.warn("[push] Cihaz kaydı yenilenemedi; sonraki açılışta yeniden denenecek.")); };
    const open = async (data: Record<string, unknown>) => {
      const current = auth.currentUser;
      if (!current) { pending = data; return; }
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, current.uid);
      if (!alive || auth.currentUser?.uid !== current.uid) return;
      const destination = pushDestination(data, hash);
      pending = null;
      if (!destination) return;
      switch (destination.screen) {
        case "chat": router.push({ pathname: "/chat/[id]", params: { id: destination.id } }); break;
        case "story": router.push({ pathname: "/story/[id]", params: { id: destination.id } }); break;
        case "questions": router.push("/anonymous-questions"); break;
        case "answer": {
          const url = getPublicShareUrl(`/qa/${encodeURIComponent(destination.id)}`);
          if (url) await WebBrowser.openBrowserAsync(url); break;
        }
        case "settings": router.push("/push-settings"); break;
      }
    };
    void nativeNotifications().then(async n => {
      if (!alive) return;
      n.setNotificationHandler({ handleNotification: async notification => {
        const current = auth.currentUser;
        const account = current ? await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, current.uid) : "";
        const own = !!account && notification.request.content.data.account === account;
        return { shouldShowBanner: own, shouldShowList: own, shouldPlaySound: own, shouldSetBadge: false };
      } });
      await n.setNotificationChannelAsync("spektrum-updates", { name: "SPEKTRUM güncellemeleri", importance: n.AndroidImportance.DEFAULT, lockscreenVisibility: n.AndroidNotificationVisibility.PRIVATE });
      if (!alive) return;
      const response = (r: import("expo-notifications").NotificationResponse) => {
        const key = `${r.notification.request.identifier}:${r.actionIdentifier}`;
        if (lastResponse === key) return;
        lastResponse = key;
        void open(r.notification.request.content.data).catch(() => console.warn("[push] Bildirim bağlantısı açılamadı."));
      };
      let lastToken: unknown;
      const taps = n.addNotificationResponseReceivedListener(response), tokens = n.addPushTokenListener(token => {
        if (token.data !== lastToken) { lastToken = token.data; sync(); }
      });
      cleanup.push(() => taps.remove(), () => tokens.remove());
      if (alive && pending) { const deferred = pending; pending = null; await open(deferred); }
      const last = await n.getLastNotificationResponseAsync();
      if (alive && last) { response(last); await n.clearLastNotificationResponseAsync(); }
    }).catch(() => console.warn("[push] Yerel bildirim hizmeti başlatılamadı."));
    sync();
    const state = AppState.addEventListener("change", next => { if (next === "active") sync(); });
    return () => { alive = false; state.remove(); cleanup.forEach(fn => fn()); };
  }, [user?.uid, loading, navigation?.key]);
  return null;
}
