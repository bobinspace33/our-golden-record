/**
 * Minimal inline Markdown for council UI: **bold**, *italic*.
 * Parses ** segments first (common in Gemini), then single-asterisk pairs in each slice.
 */
(function markdownInlineExports(global) {
  function escapeHtml(s) {
    if (s == null) return "";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function partitionBoldSegments(s) {
    const parts = [];
    let rest = String(s ?? "");
    while (rest.length) {
      const open = rest.indexOf("**");
      if (open === -1) {
        parts.push({ bold: false, text: rest });
        break;
      }
      if (open > 0) parts.push({ bold: false, text: rest.slice(0, open) });
      const after = rest.slice(open + 2);
      const close = after.indexOf("**");
      if (close === -1) {
        parts.push({ bold: false, text: rest.slice(open) });
        break;
      }
      parts.push({ bold: true, text: after.slice(0, close) });
      rest = after.slice(close + 2);
    }
    return parts;
  }

  function partitionItalicInChunk(s) {
    const parts = [];
    let rest = s;
    while (rest.length) {
      let open = -1;
      for (let i = 0; i < rest.length; i++) {
        const c = rest[i];
        if (c === "*" && rest[i + 1] === "*") {
          i++;
          continue;
        }
        if (c === "*") {
          open = i;
          break;
        }
      }
      if (open === -1) {
        parts.push({ italic: false, text: rest });
        break;
      }
      if (open > 0) parts.push({ italic: false, text: rest.slice(0, open) });
      const after = rest.slice(open + 1);
      let close = -1;
      for (let j = 0; j < after.length; j++) {
        const c = after[j];
        if (c === "*" && after[j + 1] === "*") {
          j++;
          continue;
        }
        if (c === "*") {
          close = j;
          break;
        }
      }
      if (close === -1) {
        parts.push({ italic: false, text: rest.slice(open) });
        break;
      }
      parts.push({ italic: true, text: after.slice(0, close) });
      rest = after.slice(close + 1);
    }
    return parts;
  }

  function markdownInlineToHtml(raw) {
    const boldParts = partitionBoldSegments(String(raw ?? ""));
    const htmlPieces = [];
    for (const { bold, text } of boldParts) {
      const italicParts = partitionItalicInChunk(text);
      for (const { italic, text: piece } of italicParts) {
        const escaped = escapeHtml(piece);
        let inner = escaped;
        if (italic) inner = `<em>${inner}</em>`;
        if (bold) inner = `<strong>${inner}</strong>`;
        htmlPieces.push(inner);
      }
    }
    return htmlPieces.join("");
  }

  /** Word tokens for typing animation (skips pure whitespace runs). */
  function tokenizeMarkdownLineForCouncil(line) {
    const tokens = [];
    const boldParts = partitionBoldSegments(line);
    for (const { bold, text } of boldParts) {
      const italicParts = partitionItalicInChunk(text);
      for (const { italic, text: piece } of italicParts) {
        const words = piece.split(/(\s+)/);
        for (const w of words) {
          if (!w || /^\s+$/.test(w)) continue;
          tokens.push({ type: "word", text: w, bold, italic });
        }
      }
    }
    return tokens;
  }

  global.markdownInlineToHtml = markdownInlineToHtml;
  global.tokenizeMarkdownLineForCouncil = tokenizeMarkdownLineForCouncil;
})(typeof window !== "undefined" ? window : globalThis);
