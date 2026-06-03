/**
 * Tarayıcı-içi (client-side) görsel moderasyonu — nsfwjs + TensorFlow.js.
 *
 * Model kullanıcının cihazında çalışır: görsel YÜKLENMEDEN önce taranır, hiçbir
 * sunucuya/AI servisine gitmez → sıfır Replit kredisi, sıfır sunucu yükü.
 * DM'de yüzlerce foto gönderilse bile maliyet oluşmaz.
 *
 * Model (~MobileNetV2) nsfwjs paketinin içinde bundle'lıdır; ilk kullanımda bir
 * kez indirilip tarayıcı tarafından cache'lenir, sonrası anlıktır.
 *
 * Sınırlama: nsfwjs cinsel/çıplaklık içeriğini tespit eder (DM'deki ana risk).
 * Şiddet/silah görselleri kapsam dışıdır.
 */

export interface NsfwCheckResult {
  safe: boolean;
  category: string | null;
  score: number;
}

// nsfwjs sınıfları: Drawing | Hentai | Neutral | Porn | Sexy
// Yalnızca aşağıdaki sınıflar eşiği aşarsa görsel reddedilir.
const UNSAFE_THRESHOLDS: Record<string, number> = {
  Porn: 0.6,
  Hentai: 0.6,
  Sexy: 0.85,
};

type NsfwModel = {
  classify: (
    img: HTMLImageElement,
    topk?: number,
  ) => Promise<Array<{ className: string; probability: number }>>;
};

let modelPromise: Promise<NsfwModel> | null = null;

// tfjs + nsfwjs ağır paketlerdir; yalnızca ilk görsel kontrolünde dinamik
// import ile yüklenir, böylece uygulama açılışı yavaşlamaz.
async function getModel(): Promise<NsfwModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      const nsfwjs = await import("nsfwjs");
      await tf.ready();
      return (await nsfwjs.load("MobileNetV2")) as unknown as NsfwModel;
    })().catch((err) => {
      modelPromise = null; // başarısız olursa tekrar denenebilsin
      throw err;
    });
  }
  return modelPromise;
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel okunamadı"));
    };
    img.src = url;
  });
}

/**
 * Bir görsel dosyasını yükleme öncesi tarar. Uygunsuz cinsel içerik bulursa
 * `safe: false` döndürür. GIF'lerde ilk kare değerlendirilir.
 */
export async function checkImageSafety(file: File): Promise<NsfwCheckResult> {
  const model = await getModel();
  const img = await fileToImage(file);
  try {
    const predictions = await model.classify(img, 5);
    let worst: { className: string; probability: number } | null = null;
    for (const p of predictions) {
      const threshold = UNSAFE_THRESHOLDS[p.className];
      if (
        threshold !== undefined &&
        p.probability >= threshold &&
        (!worst || p.probability > worst.probability)
      ) {
        worst = p;
      }
    }
    return worst
      ? { safe: false, category: worst.className, score: worst.probability }
      : { safe: true, category: null, score: 0 };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
