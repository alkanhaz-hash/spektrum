import { useEffect, useRef, useState, useCallback } from "react";
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  ErrorCode,
  type Purchase,
  type PurchaseError,
  type Product,
} from "react-native-iap";
import { Platform, Alert } from "react-native";
import { JETON_PACKAGES, PLAY_STORE_SKUS, type JetonPackage } from "./jeton-packages";

export type IapStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "fetching"
  | "purchasing"
  | "error";

export interface UseIapResult {
  status: IapStatus;
  products: Product[];
  purchasePackage: (pkg: JetonPackage) => Promise<void>;
  getPriceFor: (productId: string) => string | null;
}

export function useIap(
  onPurchaseSuccess: (pkg: JetonPackage, purchase: Purchase) => Promise<void>
): UseIapResult {
  const [status, setStatus] = useState<IapStatus>("idle");
  const [products, setProducts] = useState<Product[]>([]);
  const pendingPkgRef = useRef<JetonPackage | null>(null);
  const successRef = useRef(onPurchaseSuccess);
  successRef.current = onPurchaseSuccess;

  useEffect(() => {
    if (Platform.OS !== "android") return;

    let mounted = true;

    const setup = async () => {
      setStatus("connecting");
      try {
        await initConnection();
        if (!mounted) return;
        setStatus("fetching");
        const fetched = await fetchProducts({ skus: PLAY_STORE_SKUS, type: "in-app" });
        if (!mounted) return;
        setProducts((fetched ?? []) as Product[]);
        setStatus("ready");
      } catch {
        if (!mounted) return;
        setStatus("error");
      }
    };

    void setup();

    const purchaseSub = purchaseUpdatedListener(async (purchase: Purchase) => {
      if (!purchase.productId) return;

      const pkg =
        pendingPkgRef.current ??
        JETON_PACKAGES.find(p => p.productId === purchase.productId) ??
        null;

      if (!pkg) {
        await finishTransaction({ purchase, isConsumable: true });
        return;
      }

      try {
        await successRef.current(pkg, purchase);
        await finishTransaction({ purchase, isConsumable: true });
      } catch {
        Alert.alert(
          "Jeton Eklenemedi",
          "Ödemen alındı ancak jeton eklenirken sorun oluştu. Lütfen destek ekibiyle iletişime geç.",
          [{ text: "Tamam" }]
        );
        await finishTransaction({ purchase, isConsumable: true });
      } finally {
        pendingPkgRef.current = null;
        setStatus("ready");
      }
    });

    const errorSub = purchaseErrorListener((error: PurchaseError) => {
      pendingPkgRef.current = null;
      setStatus("ready");

      if (error.code === ErrorCode.UserCancelled) return;

      const msg =
        error.code === ErrorCode.ItemUnavailable
          ? "Bu ürün şu an mevcut değil."
          : error.code === ErrorCode.NetworkError
          ? "İnternet bağlantını kontrol et ve tekrar dene."
          : `Ödeme başarısız: ${error.message}`;

      Alert.alert("Ödeme Hatası", msg, [{ text: "Tamam" }]);
    });

    return () => {
      mounted = false;
      purchaseSub.remove();
      errorSub.remove();
      void endConnection();
    };
  }, []);

  const purchasePackage = useCallback(
    async (pkg: JetonPackage) => {
      if (status !== "ready") return;
      if (Platform.OS !== "android") {
        Alert.alert("Bilgi", "Uygulama içi satın alma yalnızca Android cihazlarda çalışır.");
        return;
      }
      pendingPkgRef.current = pkg;
      setStatus("purchasing");
      try {
        await requestPurchase({
          type: "in-app",
          request: {
            google: { skus: [pkg.productId] },
          },
        });
      } catch {
        pendingPkgRef.current = null;
        setStatus("ready");
      }
    },
    [status]
  );

  const getPriceFor = useCallback(
    (productId: string): string | null => {
      const p = products.find(x => x.id === productId);
      return p?.displayPrice ?? null;
    },
    [products]
  );

  return { status, products, purchasePackage, getPriceFor };
}
