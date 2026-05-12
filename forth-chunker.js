// Splits Forth source into semantically meaningful chunks for embedding.
// Each chunk is { text, file, startLine, type }.

export function chunkForthCode(src, filePath) {
  const lines = src.split('\n');
  const chunks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines
    if (!trimmed) { i++; continue; }

    // Collect leading line comments before a definition
    const commentBuf = [];
    while (i < lines.length && /^\\/.test(lines[i].trim())) {
      commentBuf.push(lines[i]);
      i++;
    }

    if (i >= lines.length) {
      if (commentBuf.length) chunks.push(makeChunk(commentBuf, filePath, i - commentBuf.length, 'comment'));
      break;
    }

    const defLine = lines[i].trim();

    // Word definition: `: name ... ;`  (may span multiple lines)
    if (/^:[\s]/.test(defLine) && !/^:noname/i.test(defLine)) {
      const start = i - commentBuf.length;
      const defLines = [...commentBuf];
      let depth = 1;
      while (i < lines.length && depth > 0) {
        defLines.push(lines[i]);
        const t = lines[i].trim();
        // crude depth tracking for nested definitions
        if (/^:[\s]/.test(t) && defLines.length > 1) depth++;
        if (/^;(\s|$)/.test(t) || / ;(\s|$)/.test(t) || t === ';') depth--;
        i++;
      }
      chunks.push(makeChunk(defLines, filePath, start, 'definition'));
      continue;
    }

    // :NONAME
    if (/^:noname/i.test(defLine)) {
      const start = i - commentBuf.length;
      const defLines = [...commentBuf];
      while (i < lines.length) {
        defLines.push(lines[i]);
        const t = lines[i].trim();
        i++;
        if (/^;(\s|$)/.test(t) || / ;(\s|$)/.test(t) || t === ';') break;
      }
      chunks.push(makeChunk(defLines, filePath, start, 'definition'));
      continue;
    }

    // Single-line declarations: VARIABLE, CONSTANT, VALUE, DEFER, CREATE, ALIAS, etc.
    if (/^(VARIABLE|2VARIABLE|FVARIABLE|CONSTANT|2CONSTANT|FCONSTANT|VALUE|2VALUE|FVALUE|DEFER|CREATE|ALIAS|VOCABULARY|WORDLIST)\s/i.test(defLine)) {
      const start = i - commentBuf.length;
      chunks.push(makeChunk([...commentBuf, lines[i]], filePath, start, 'declaration'));
      i++;
      continue;
    }

    // Stray comment lines with no following definition
    if (commentBuf.length) {
      chunks.push(makeChunk(commentBuf, filePath, i - commentBuf.length, 'comment'));
    }

    // Everything else: accumulate as a "code block" until a blank line
    const blockStart = i;
    const blockLines = [];
    while (i < lines.length && lines[i].trim() !== '') {
      blockLines.push(lines[i]);
      i++;
    }
    if (blockLines.length) {
      chunks.push(makeChunk(blockLines, filePath, blockStart, 'code'));
    }
  }

  return chunks;
}

function makeChunk(lines, file, startLine, type) {
  return {
    text: lines.join('\n').trim(),
    file,
    startLine: startLine + 1,
    type,
  };
}
