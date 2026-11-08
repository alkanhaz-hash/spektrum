import { AppLayout } from "@/components/layout/AppLayout";
import { motion } from "framer-motion";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const SORULAR = [
  {
    soru: "Nasıl kayıt olurum?",
    cevap: `SPEKTRUM'a kayıt olmak çok kolay!\n\n1. Sağ üst köşedeki "Giriş Yap" butonuna tıklayın.\n2. "Kayıt Ol" sekmesini seçin.\n3. E-posta adresinizi ve şifrenizi girin, ardından "Kayıt Ol" butonuna basın.\n4. Size gönderilen doğrulama e-postasını onaylayın.\n5. Kullanıcı adınızı belirleyin ve platforma hoş geldiniz!\n\nAlternatif olarak Google hesabınızla da hızlıca giriş yapabilirsiniz.`
  },
  {
    soru: "E-posta onayını nasıl yapabilirim?",
    cevap: `Kayıt olduktan sonra e-posta adresinize bir doğrulama maili gönderilir.\n\n1. E-posta kutunuzu kontrol edin (spam klasörünü de kontrol etmeyi unutmayın).\n2. SPEKTRUM'dan gelen "E-postanızı Doğrulayın" başlıklı maili bulun.\n3. Maildeki "E-postamı Doğrula" butonuna tıklayın.\n4. Sayfaya yönlendirildikten sonra hesabınız aktif hale gelecektir.\n\nE-posta gelmedi mi? Giriş ekranındaki "Doğrulama e-postasını tekrar gönder" seçeneğini kullanabilirsiniz.`
  },
  {
    soru: "Şifremi nasıl değiştirebilirim?",
    cevap: `Şifrenizi iki şekilde değiştirebilirsiniz:\n\n**Giriş yapabiliyorsanız:**\n1. Profil sayfanıza gidin.\n2. "Hesap Ayarları" bölümünden "Şifre Değiştir" seçeneğini kullanın.\n\n**Şifrenizi unuttuysanız:**\n1. Giriş sayfasında "Şifremi Unuttum" linkine tıklayın.\n2. E-posta adresinizi girin.\n3. Gelen şifre sıfırlama e-postasındaki linke tıklayın ve yeni şifrenizi belirleyin.`
  },
  {
    soru: "Nasıl şikayet edebilirim?",
    cevap: `Uygunsuz içerik veya kullanıcıları uygulama içinden şikayet edebilirsiniz:\n\n**Hikaye/Bölüm şikayeti:**\n• Hikaye sayfasında "Şikayet Et" butonuna tıklayın.\n• Şikayet sebebini seçin ve gönderin.\n\n**Kullanıcı şikayeti:**\n• Kullanıcının profil sayfasında "Şikayet Et" seçeneğini kullanın.\n\nTüm şikayetler moderatör ekibimiz tarafından incelenmektedir.`
  },
  {
    soru: "Nasıl bölüm eklerim?",
    cevap: `Hikayenize yeni bölüm eklemek için:\n\n1. Üst menüden "Yaz" seçeneğine tıklayın.\n2. Bölüm eklemek istediğiniz hikayeyi seçin.\n3. "Yeni Bölüm Ekle" butonuna tıklayın.\n4. Bölüm başlığını ve içeriğini yazın.\n5. Bölümü "Yayınla" butonuyla gönderin.\n\nBölümünüz moderasyon incelemesinden geçtikten sonra okuyucularla paylaşılacaktır. İnceleme süreci genellikle 24 saat içinde tamamlanır.`
  },
  {
    soru: "Nasıl kitap/hikaye yazabilirim?",
    cevap: `SPEKTRUM'da hikaye yazmak için:\n\n1. Üst menüden "Yaz" butonuna tıklayın.\n2. "Yeni Hikaye Oluştur" seçeneğini seçin.\n3. Hikayenizin başlığını, açıklamasını ve türünü girin.\n4. İsterseniz kapak görseli yükleyin.\n5. Hikayenizi oluşturun ve ilk bölümünüzü yazmaya başlayın.\n\nHikayeniz taslak olarak kaydedilir; hazır hissedince bölümlerinizi yayına gönderin.`
  },
  {
    soru: "Nasıl para kazanabilirim?",
    cevap: `SPEKTRUM'da yazarlar içeriklerini ücretli olarak yayınlayabilir:\n\n**Ücretli Bölüm Sistemi:**\n• Bölüm yayınlarken "Ücretli" seçeneğini işaretleyin.\n• Ücretlendirme kelime bazlı tarifeden otomatik hesaplanır.\n• Okuyucular bölümü okumak için jeton kullanır.\n• Jetonlar yazarın hesabına aktarılır.\n\n**Ödeme:**\n• Kazandığınız jetonları gerçek paraya çevirme işlemleri hesap ayarları üzerinden gerçekleştirilecektir.\n• Minimum çekim miktarı bilgisi için hesap ayarlarını inceleyiniz.\n\nSorularınız için destek@spektrum.com.tr adresine yazabilirsiniz.`
  },
];

import { useLocale } from "@/contexts/LocaleContext";

function SSSSoru({ soru, cevap, delay }: { soru: string; cevap: string; delay: number }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="border border-border rounded-2xl overflow-hidden"
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left bg-card hover:bg-muted/50 transition-colors"
      >
        <span className="font-semibold text-foreground">{t(soru)}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-primary shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        }
      </button>
      {open && (
        <div className="px-6 py-5 bg-background border-t border-border">
          <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-line">{t(cevap)}</p>
        </div>
      )}
    </motion.div>
  );
}

export default function SSSPage() {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-14 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-3 mb-4">
            <HelpCircle className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold font-serif">Sıkça Sorulan Sorular</h1>
          </div>
          <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
            Merak ettiğiniz konuların cevaplarını burada bulabilirsiniz.
          </p>
        </motion.div>

        <div className="space-y-3">
          {SORULAR.map((s, i) => (
            <SSSSoru key={i} soru={s.soru} cevap={s.cevap} delay={i * 0.05} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-10 p-5 rounded-2xl border border-primary/20 bg-primary/5 text-center"
        >
          <p className="text-muted-foreground text-sm">
            Sorunuzu burada bulamadınız mı?{" "}
            <a href="/iletisim" className="text-primary font-semibold hover:underline">
              Bize ulaşın
            </a>
          </p>
        </motion.div>
      </div>
    </AppLayout>
  );
}
