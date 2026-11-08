import { useEffect } from "react";
import { useLocale } from "@/contexts/LocaleContext";

function setMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  const created = !el;
  const prev = el?.getAttribute("content") ?? null;
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", value);
  return () => {
    if (created) el!.remove();
    else if (prev !== null) el!.setAttribute("content", prev);
  };
}

export function usePageSeo(title: string, description: string) {
  const { t } = useLocale();
  useEffect(() => {
    const localizedTitle = t(title);
    const localizedDescription = t(description);
    const prevTitle = document.title;
    document.title = localizedTitle;
    const undo = [
      setMeta("name", "description", localizedDescription),
      setMeta("property", "og:title", localizedTitle),
      setMeta("property", "og:description", localizedDescription),
      setMeta("property", "og:type", "website"),
      setMeta("property", "og:site_name", "SPEKTRUM"),
      setMeta("property", "og:url", window.location.href),
    ];
    return () => { document.title = prevTitle; undo.forEach(u => u()); };
  }, [title, description, t]);
}
