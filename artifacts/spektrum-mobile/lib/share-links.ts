import Constants from "expo-constants";

function getWebOrigin(): string | null {
  // External shares must use the public website, not the temporary API/preview host.
  const publicWebsiteUrl: unknown = Constants.expoConfig?.extra?.publicWebsiteUrl;
  const configuredDomain = typeof publicWebsiteUrl === "string"
    ? publicWebsiteUrl.trim()
    : null;
  if (!configuredDomain) return null;

  const normalizedDomain = configuredDomain.replace(/\/+$/, "");
  return /^https?:\/\//i.test(normalizedDomain)
    ? normalizedDomain
    : `https://${normalizedDomain}`;
}

export function getPublicShareUrl(path: string): string | null {
  const origin = getWebOrigin();
  if (!origin) return null;

  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getPublicProfileUrl(uid: string): string | null {
  return getPublicShareUrl(`/profile/${encodeURIComponent(uid)}`);
}

export function getPublicStoryUrl(storyId: string): string | null {
  return getPublicShareUrl(`/story/${encodeURIComponent(storyId)}`);
}

export function getPublicQuestionInvitationUrl(uid: string): string | null {
  return getPublicShareUrl(`/ask/${encodeURIComponent(uid)}`);
}
