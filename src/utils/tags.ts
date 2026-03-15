/** 与 Electron 版 OneThought 的 src/renderer/utils/tags.ts 保持一致（仅复制到本工程） */

const TAG_RE = /#([^\s#]+)/gu;

export function extractTagsFromContent(content: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(content)) !== null) {
    set.add(m[1].trim());
  }
  return [...set];
}

export function clampText(text: string, maxLines: number, maxLength?: number): string {
  const lines = text.split(/\n/);
  if (lines.length > maxLines) {
    const joined = lines.slice(0, maxLines).join("\n");
    return maxLength && joined.length > maxLength ? joined.slice(0, maxLength) + "…" : joined + "…";
  }
  const result = lines.join("\n");
  if (maxLength && result.length > maxLength) return result.slice(0, maxLength) + "…";
  return result;
}
