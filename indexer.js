// indexer.js
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { chunkForthCode } from "./forth-chunker.js";

const openai = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
});

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

  // nomic-embed-text: 2048 token limit (BERT), Forth hat viele 1-char-Tokens → worst case 1 char = 1 Token
  const MAX_CHARS = 2000;
  for (const c of allChunks) {
    if (c.text.length > MAX_CHARS) c.text = c.text.slice(0, MAX_CHARS);
  }

  // Batched Embedding (max 2048 inputs pro Request)
  const BATCH = 100;
  const embedded = [];
  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    const res = await openai.embeddings.create({
      model: "nomic-embed-text",
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
