import { useEffect, useState } from "react";

const PUBLIC_ORIGIN = "https://spektrumapp.com.tr";
const ANDROID_PACKAGE = "com.alkanhaz.spektrum";

export function OpenInAppLink({ path }: { path: string }) {
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    setIsAndroid(/android/i.test(navigator.userAgent));
  }, []);

  if (!isAndroid) return null;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const webUrl = new URL(normalizedPath, PUBLIC_ORIGIN).href;
  const destination = new URL(webUrl);
  const intentUrl =
    `intent://${destination.host}${destination.pathname}${destination.search}` +
    `#Intent;scheme=https;package=${ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;

  return (
    <a
      href={intentUrl}
      className="block rounded-xl border border-primary px-4 py-3 text-center font-semibold text-primary"
    >
      SPEKTRUM uygulamasında aç
    </a>
  );
}
