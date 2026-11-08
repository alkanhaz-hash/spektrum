export function pushDestination(data: Record<string, unknown>, accountHash: string) {
  if (data.version !== "1" || data.account !== accountHash || typeof data.targetId !== "string"
    || !/^[A-Za-z0-9_-]{1,200}$/.test(data.targetId)) return null;
  const screen = ({ message: "chat", chapter: "story", comment: "story", question: "questions", answer: "answer", test: "settings" } as Record<string, string>)[String(data.mode)];
  return typeof screen === "string" ? { screen, id: data.targetId } : null;
}
