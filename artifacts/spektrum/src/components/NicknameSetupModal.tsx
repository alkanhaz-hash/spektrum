import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AtSign, Sparkles, User, Calendar, ChevronDown } from "lucide-react";
import { updateUserProfile } from "@/lib/auth-service";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface Props {
  uid: string;
  onComplete: (nickname: string) => void;
}

const GENDER_OPTIONS = [
  { value: "kadin", label: "Kadın" },
  { value: "erkek", label: "Erkek" },
  { value: "belirtmiyorum", label: "Belirtmek istemiyorum" },
];

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 flex-shrink-0" onClick={() => onChange(!checked)}>
        <div
          className={`w-4 h-4 rounded border transition-colors ${
            checked
              ? "bg-primary border-primary"
              : "border-border bg-background/50 group-hover:border-primary/50"
          }`}
        >
          {checked && (
            <svg
              viewBox="0 0 10 8"
              className="w-full p-0.5 text-primary-foreground fill-none stroke-current stroke-2"
            >
              <polyline points="1,4 4,7 9,1" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground leading-relaxed">{children}</span>
    </label>
  );
}

export function NicknameSetupModal({ uid, onComplete }: Props) {
  const { toast } = useToast();
  const [nickname, setNickname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [kvkkAccepted, setKvkkAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const trimmed = nickname.trim();
  const nicknameValid = trimmed.length >= 3 && trimmed.length <= 30;
  const canSubmit = nicknameValid && birthDate && gender && termsAccepted && kvkkAccepted && !saving;

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await updateUserProfile(uid, { displayName: trimmed });
      await updateDoc(doc(db, "users", uid), {
        nicknameSet: true,
        birthDate,
        gender,
      });
      onComplete(trimmed);
    } catch {
      toast({
        title: "Hata",
        description: "Bilgiler kaydedilemedi, tekrar dene.",
        variant: "destructive",
      });
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
          className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        >
          {/* Sabit başlık */}
          <div className="px-8 pt-8 pb-4 flex-shrink-0">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
            </div>
            <h2 className="text-xl font-bold font-serif text-center mb-1">Profilini Oluştur</h2>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Devam etmek için aşağıdaki bilgileri doldur.
            </p>
          </div>

          {/* Kaydırılabilir içerik */}
          <div className="overflow-y-auto flex-1 px-8 pb-2 space-y-5">
            {/* Takma ad */}
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">
                Takma Ad <span className="text-muted-foreground font-normal">(Nickname)</span>
              </label>
              <div className="relative">
                <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder="takma_adın"
                  maxLength={30}
                  className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
              {trimmed.length > 0 && !nicknameValid && (
                <p className="text-xs text-red-400 mt-1">
                  {trimmed.length < 3 ? "En az 3 karakter olmalı" : "En fazla 30 karakter"}
                </p>
              )}
            </div>

            {/* Doğum tarihi */}
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Doğum Tarihi
                </span>
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                max={new Date(Date.now() - 13 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
              <p className="text-xs text-muted-foreground mt-1">En az 13 yaşında olmalısın.</p>
            </div>

            {/* Cinsiyet */}
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Cinsiyet
                </span>
              </label>
              <div className="relative">
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none pr-9"
                >
                  <option value="">Seç...</option>
                  {GENDER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Onay kutuları */}
            <div className="space-y-3 pt-1">
              <Checkbox checked={termsAccepted} onChange={setTermsAccepted}>
                <Link
                  href="/terms"
                  className="text-primary hover:underline font-medium"
                  target="_blank"
                  onClick={e => e.stopPropagation()}
                >
                  Kullanıcı Sözleşmesi
                </Link>
                'ni okudum ve onaylıyorum.
              </Checkbox>
              <Checkbox checked={kvkkAccepted} onChange={setKvkkAccepted}>
                <Link
                  href="/kvkk"
                  className="text-primary hover:underline font-medium"
                  target="_blank"
                  onClick={e => e.stopPropagation()}
                >
                  KVKK Aydınlatma Metni
                </Link>
                'ni okudum, kişisel verilerimin işlenmesini onaylıyorum.
              </Checkbox>
            </div>
          </div>

          {/* Sabit alt buton */}
          <div className="px-8 py-6 flex-shrink-0">
            <button
              onClick={handleSave}
              disabled={!canSubmit}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Kaydediliyor..." : "Devam Et"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
