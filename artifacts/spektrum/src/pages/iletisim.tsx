import { AppLayout } from "@/components/layout/AppLayout";
import { motion } from "framer-motion";
import { Mail, MessageSquare, Shield, Clock } from "lucide-react";

export default function IletisimPage() {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-14 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-3 mb-4">
            <Mail className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold font-serif">İletişim</h1>
          </div>
          <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
            Sorularınız, önerileriniz veya şikayetleriniz için aşağıdaki kanallardan bize ulaşabilirsiniz.
          </p>
        </motion.div>

        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="p-6 rounded-2xl border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3 mb-3">
              <Mail className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold">E-posta</h2>
            </div>
            <p className="text-muted-foreground text-sm mb-2">Genel sorular ve destek için:</p>
            <a href="mailto:destek@spektrum.com.tr" className="text-primary font-semibold hover:underline">
              destek@spektrum.com.tr
            </a>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="p-6 rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <Shield className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold">İçerik Şikayeti</h2>
            </div>
            <p className="text-muted-foreground text-sm mb-2">
              Uygunsuz içerik bildirimi için hikaye veya profil sayfasındaki "Şikayet Et" butonunu kullanabilir ya da bize e-posta gönderebilirsiniz:
            </p>
            <a href="mailto:moderasyon@spektrum.com.tr" className="text-primary font-semibold hover:underline">
              moderasyon@spektrum.com.tr
            </a>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="p-6 rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <MessageSquare className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold">İş Birliği & Basın</h2>
            </div>
            <p className="text-muted-foreground text-sm mb-2">
              Reklam, iş birliği ve basın ilişkileri için:
            </p>
            <a href="mailto:iletisim@spektrum.com.tr" className="text-primary font-semibold hover:underline">
              iletisim@spektrum.com.tr
            </a>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="p-6 rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <h2 className="text-lg font-bold">Yanıt Süresi</h2>
            </div>
            <p className="text-foreground/80 text-sm leading-relaxed">
              E-posta başvurularına genellikle <span className="text-primary font-semibold">1-3 iş günü</span> içinde yanıt veriyoruz. 
              Acil durumlar ve içerik şikayetleri öncelikli olarak değerlendirilmektedir.
            </p>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
