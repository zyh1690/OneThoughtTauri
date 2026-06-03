export function getTagSuggestions(value: string, allTags: string[], selectedIndex: number) {
  const hashMatch = value.match(/#([^\s#]*)$/u);
  const prefix = hashMatch ? hashMatch[1] : "";
  const prefixLower = prefix.toLowerCase();
  let suggestions = hashMatch
    ? prefixLower
      ? allTags.filter((tag) => tag.toLowerCase().startsWith(prefixLower))
      : allTags.slice(0, 10)
    : allTags.slice(0, 15);
  if (hashMatch && prefix && !suggestions.includes(prefix)) {
    suggestions = [prefix, ...suggestions];
  }
  const safeIndex = suggestions.length === 0 ? 0 : selectedIndex % suggestions.length;
  return { hashMatch, prefix, suggestions, selectedIndex: safeIndex };
}

export function applyTagSuggestion(value: string, tag: string) {
  const before = value.replace(/#[^\s#]*$/u, "");
  return (before === "" ? before : before + " ") + "#" + tag + " ";
}
