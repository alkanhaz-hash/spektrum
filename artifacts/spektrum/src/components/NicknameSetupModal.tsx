import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AtSign, Sparkles } from "lucide-react";
import { updateUserProfile } from "@/lib/auth-service";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";

interface Props {
  uid: string;
  onComplete: (nickname: string) => void;
}

export function NicknameSetupModal({ uid, onComplete }: Props) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const trimmed = value.trim();
  const isValid = trimmed.length >= 3 && trimmed.length <= 30;

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await updateUserProfile(uid, { displayName: trimmed });
      await updateDoc(doc(db, "users", uid), { nicknameSet: true });
      onComplete(trimmed);
    } catch {
      toast({ title: "Hata", description: "Takma ad kaydedilemedi, tekrar dene.", variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 shadow-2xl"
        >
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
          </div>

          <h2 className="text-xl font-bold font-serif text-center mb-1">Takma Adını Seç</h2>
          <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
            Diğer kullanıcılar seni bu isimle bulacak. İstediğin zaman profilinden değiştirebilirsin.
          </p>

          <div className="relative mb-2">
            <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              placeholder="takma_adın"
              maxLength={30}
              className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
          <p className={`text-xs mb-6 ${trimmed.length > 0 && !isValid ? "text-red-400" : "text-muted-foreground"}`}>
            {trimmed.length > 0 && trimmed.length < 3
              ? "En az 3 karakter olmalı"
              : trimmed.length > 30
              ? "En fazla 30 karakter olabilir"
              : "3–30 karakter"}
          </p>

          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Kaydediliyor..." : "Devam Et"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
