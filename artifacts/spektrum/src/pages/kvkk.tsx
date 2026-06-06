import { AppLayout } from "@/components/layout/AppLayout";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

export default function KvkkPage() {
  return (
    <AppLayout>
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold font-serif">KVKK Aydınlatma Metni</h1>
          </div>

          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) uyarınca, Spektrum App veri sorumlusu sıfatıyla
            hareket etmektedir.
          </p>

          <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">1. İşlenen Kişisel Verileriniz</h2>
              <p>
                Platform'a kayıt olmanız ve uygulamayı kullanmanız kapsamında; e-posta adresiniz, kullanıcı adınız,
                profil bilgileriniz (biyografi, durum bilgisi) ile uygulama içi etkileşim verileriniz (yazdığınız
                hikayeler, yaptığınız yorumlar, gönderdiğiniz mesajlar ve anonim sorular) işlenmektedir.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">2. Veri İşleme Amacı ve Hukuki Sebebi</h2>
              <p>
                Kişisel verileriniz; hesabınızın oluşturulması, platform içi iletişim (DM, anonim soru)
                fonksiyonlarının yürütülmesi, yapay zeka destekli güvenlik filtrelerinin işletilerek topluluk
                güvenliğinin sağlanması ve sistemin stabil çalışması amaçlarıyla, kanunun 5. maddesinde belirtilen
                "bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması" hukuki sebebine dayanarak
                işlenmektedir.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">3. Verilerin Saklanması ve Aktarılması</h2>
              <p>
                Verileriniz güvenli bulut altyapılarında (Firebase sunucularında) şifrelenmiş olarak saklanır. Yasal
                zorunluluklar, siber suç duyuruları veya mahkeme kararları haricinde üçüncü şahıslarla asla ticari
                amaçla paylaşılmaz veya aktarılmaz.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">4. Haklarınız</h2>
              <p>
                KVKK'nın 11. maddesi uyarınca dilediğiniz zaman hesabınızı ayarlar bölümünden silebilir, verilerinizin
                tamamen yok edilmesini talep edebilir veya işlenen verileriniz hakkında bilgi almak için platform
                yönetimiyle iletişime geçebilirsiniz.
              </p>
            </section>

          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
