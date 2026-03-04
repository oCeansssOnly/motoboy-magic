import { Emoji, EmojiStyle } from "emoji-picker-react";

export function getAppleEmojiUrl(name: string) {
  if (!name) return "";
  const unified = Array.from(name)
    .map((c) => c.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join("-");
  return `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${unified}.png`;
}

export function AppleEmoji({ name, size = 24 }: { name: string; size?: number }) {
  if (!name) return null;
  const unified = Array.from(name)
    .map((c) => c.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join("-");

  return (
    <div className="flex items-center justify-center leading-none" style={{ width: size, height: size }}>
      <img src={getAppleEmojiUrl(name)} alt={name} width={size} height={size} style={{ userSelect: "none", objectFit: "contain" }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
    </div>
  );
}
