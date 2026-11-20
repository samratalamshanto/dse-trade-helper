function extractJson(text, key) {
  const needle = `"${key}":`;
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    const value = parseAt(text, at + needle.length);
    if (value !== null) return value;
  }
  return null;
}

function parseAt(text, i) {
  const open = text[i];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (inString) {
      if (ch === '\\') j++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
    }
  }
  return null;
}

module.exports = { extractJson };
