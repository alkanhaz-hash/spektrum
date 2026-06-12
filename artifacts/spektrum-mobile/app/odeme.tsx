import { useEffect } from "react";
import { router } from "expo-router";

export default function OdemeRedirect() {
  useEffect(() => {
    router.replace("/jetonlar");
  }, []);
  return null;
}
