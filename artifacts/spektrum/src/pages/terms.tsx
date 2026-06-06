import { AppLayout } from "@/components/layout/AppLayout";
import { motion } from "framer-motion";
import { ScrollText } from "lucide-react";

export default function TermsPage() {
  return (
    <AppLayout>
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ScrollText className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold font-serif">Kullanıcı Sözleşmesi</h1>
          </div>

          <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">1. Taraflar ve Amaç</h2>
              <p>
                İşbu sözleşme, Spektrum App mobil uygulaması (bundan sonra "Platform" olarak anılacaktır) ile
                uygulamaya üye olan kullanıcı (bundan sonra "Kullanıcı" olarak anılacaktır) arasında, Platform'un
                kullanım şartlarını belirlemek amacıyla akdedilmiştir.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">2. Hukuki Statü ve Yer Sağlayıcı Beyanı</h2>
              <p>
                Spektrum App, 5651 sayılı Kanun uyarınca bir "Yer Sağlayıcı"dır. Platform, kullanıcılar tarafından
                yüklenen hikaye, yorum, mesaj ve anonim soruların içeriğini önceden kontrol etmekle yükümlü değildir.
                Ancak yasa dışı, telif hakkı ihlali barındıran veya kamu düzenini bozan içerikler şikayet üzerine ya
                da sistem tarafından tespit edildiğinde derhal kaldırılacaktır.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">3. Kullanım Şartları ve İçerik Politikası</h2>
              <ul className="space-y-3 list-none pl-0">
                <li>
                  <span className="font-medium text-foreground">Kullanıcı Sorumluluğu:</span>{" "}
                  Kullanıcı, Platform üzerinde yayınladığı tüm yazı, yorum ve anonim sorulardan hukuki ve cezai
                  olarak bizzat sorumludur.
                </li>
                <li>
                  <span className="font-medium text-foreground">Güvenlik Filtresi ve Moderasyon:</span>{" "}
                  Platform, topluluk güvenliğini ve kamu kurumlarının (Aile ve Sosyal Hizmetler Bakanlığı vb.)
                  hassasiyetlerini korumak amacıyla yapay zeka ve kelime filtreleme algoritmaları kullanır. Küfür,
                  müstehcenlik, şiddet, uyuşturucuya özendirme veya siber zorbalık içeren içerikler sistem tarafından
                  otomatik olarak engellenecek ve "Onay Bekliyor" statüsüne alınacaktır. Bu kuralları sistematik olarak
                  ihlal eden kullanıcıların hesapları feshedilir.
                </li>
                <li>
                  <span className="font-medium text-foreground">Anonim Sorular:</span>{" "}
                  "Anonim Soru Sorma" özelliği kapsamında gönderilen sorular da aynı filtreleme sistemine tabidir.
                  Anonimlik, diğer kullanıcılara hakaret veya taciz etme hakkı vermez; yasal soruşturma durumlarında
                  ilgili makamlarla gerekli teknik veriler paylaşılabilir.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">4. Yürürlük</h2>
              <p>
                Kullanıcı, kayıt ekranında yer alan "Kullanıcı Sözleşmesini okudum, onaylıyorum" kutucuğunu
                işaretleyerek bu sözleşmenin tüm şartlarını kabul etmiş sayılır.
              </p>
            </section>

          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
