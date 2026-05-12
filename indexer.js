// indexer.js
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { chunkForthCode } from "./forth-chunker.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function indexCodebase(rootDir) {
  const allChunks = [];

  // Alle .fs / .fth / .4th Dateien einlesen
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(f|fs|fth|4th|forth)$/i.test(entry.name)) {
        const src = fs.readFileSync(full, "utf-8");
        allChunks.push(...chunkForthCode(src, full));
      }
    }
  }
  walk(rootDir);

  console.log(`${allChunks.length} Chunks gefunden, beginne Embedding...`);

  // 8192 tokens max; Forth hat viele 1-char-Tokens (!@+-; etc.) → 1 char kann 1 Token sein
  const MAX_CHARS = 8000;
  for (const c of allChunks) {
    if (c.text.length > MAX_CHARS) c.text = c.text.slice(0, MAX_CHARS);
  }

  // Batched Embedding (max 2048 inputs pro Request)
  const BATCH = 100;
  const embedded = [];
  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    const res = await openai.embeddings.create({
      model: "text-embedding-3-large", // Besser für Code
      input: batch.map(c => c.text),
    });
    batch.forEach((chunk, j) => {
      embedded.push({ ...chunk, embedding: res.data[j].embedding });
    });
    console.log(`${Math.min(i + BATCH, allChunks.length)}/${allChunks.length}`);
  }

  // Index speichern
  fs.writeFileSync("forth-index.json", JSON.stringify(embedded));
  console.log("Index gespeichert: forth-index.json");
  return embedded;
}

const rootDir = process.argv[2];
if (!rootDir) {
  console.error("Usage: node indexer.js <path-to-forth-project>");
  process.exit(1);
}
indexCodebase(rootDir).catch(err => { console.error(err); process.exit(1); });
