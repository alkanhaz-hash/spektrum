import { AppLayout } from "@/components/layout/AppLayout";
import { motion } from "framer-motion";
import { Sparkles, BookOpen, Users, Shield, Zap } from "lucide-react";

export default function HakkimizdaPage() {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-14 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold font-serif">Hakkımızda</h1>
          </div>
          <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
            SPEKTRUM, Türkçe dijital hikaye anlatımı için tasarlanmış bir yaratıcı yazarlık platformudur.
          </p>
        </motion.div>

        <div className="space-y-8">
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="p-6 rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold font-serif">Hikayemiz</h2>
            </div>
            <p className="text-foreground/80 leading-relaxed">
              SPEKTRUM, Türkçe içerik üreticilerinin kaliteli, özgün eserlerini geniş bir okuyucu kitlesine ulaştırabileceği modern bir platform olma vizyonuyla kurulmuştur. Yazarlarımız, eserlerini bölüm bölüm yayınlayabilir; okuyucular ise favori hikayelerini takip edebilir, yorum yapabilir ve yazarlarla etkileşime girebilir.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="p-6 rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <Zap className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold font-serif">Misyonumuz</h2>
            </div>
            <p className="text-foreground/80 leading-relaxed">
              Türk yazarlara ve okuyuculara dünya standartlarında bir dijital yayın deneyimi sunmak. Her hikayenin hak ettiği okuyucuya ulaşmasını sağlamak ve yaratıcı ekonomiyi desteklemek temel hedefimizdir.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="p-6 rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold font-serif">Topluluğumuz</h2>
            </div>
            <p className="text-foreground/80 leading-relaxed">
              Fantastikten romana, korku'dan bilim kurguya onlarca türde eser barındıran platformumuzda her zevke uygun içerik bulunmaktadır. Yazarlar ve okuyucular arasındaki bağı güçlendiren yorum sistemi ve direkt mesajlaşma özelliğimiz ile canlı bir topluluk oluşturduk.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="p-6 rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold font-serif">Güvenli Platform</h2>
            </div>
            <p className="text-foreground/80 leading-relaxed">
              İçerik moderasyonu sistemimiz sayesinde platformumuz her yaştan okuyucu için güvenli bir ortam sunmaktadır. AI destekli içerik analizi ve deneyimli moderatör ekibimiz, topluluk standartlarımızın korunmasını sağlar.
            </p>
          </motion.section>
        </div>
      </div>
    </AppLayout>
  );
}
