import { useCallback } from "react";
import { Alert } from "react-native";
import type { JetonPackage } from "./jeton-packages";

export type Purchase = {
  productId: string;
  transactionId?: string;
  transactionReceipt?: string;
};

export type IapStatus = "idle" | "connecting" | "ready" | "fetching" | "purchasing" | "error" | "unavailable";

export interface UseIapResult {
  status: IapStatus;
  products: never[];
  purchasePackage: (pkg: JetonPackage) => Promise<void>;
  getPriceFor: (productId: string) => string | null;
}

export function useIap(
  _onPurchaseSuccess: (pkg: JetonPackage, purchase: Purchase) => Promise<void>
): UseIapResult {
  const purchasePackage = useCallback(async (_pkg: JetonPackage) => {
    Alert.alert(
      "Yakında",
      "Uygulama içi satın alma yakında aktif olacak.",
      [{ text: "Tamam" }]
    );
  }, []);

  const getPriceFor = useCallback((_productId: string): string | null => null, []);

  return {
    status: "unavailable",
    products: [],
    purchasePackage,
    getPriceFor,
  };
}
