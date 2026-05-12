// rag.js  —  Usage: node rag.js "Wie funktioniert der AES-Schlüsselaufbau?"
import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INDEX_FILE = "forth-index.json";
const EMBED_MODEL = "text-embedding-3-large";
const CHAT_MODEL  = "gpt-4o";
const TOP_K       = 6;

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`Index nicht gefunden: ${INDEX_FILE}\nZuerst: node indexer.js <pfad>`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
}

async function retrieve(query, index) {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: [query],
  });
  const qVec = res.data[0].embedding;

  return index
    .map(chunk => ({ ...chunk, score: cosineSimilarity(qVec, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}

function buildContext(chunks) {
  return chunks.map((c, i) => {
    const loc = `${c.file}:${c.startLine} [${c.type}]`;
    return `--- Chunk ${i + 1} (${loc}) ---\n${c.text}`;
  }).join("\n\n");
}

async function ask(query) {
  const index = loadIndex();
  console.log(`Index geladen: ${index.length} Chunks\nSuche nach: "${query}"\n`);

  const topChunks = await retrieve(query, index);

  console.log("Relevanteste Chunks:");
  topChunks.forEach((c, i) =>
    console.log(`  ${i + 1}. [${c.type}] ${c.file}:${c.startLine}  (score: ${c.score.toFixed(4)})`)
  );
  console.log();

  const context = buildContext(topChunks);
  const systemPrompt =
    "Du bist ein Forth-Experte. Beantworte die Frage ausschließlich auf Basis der " +
    "bereitgestellten Code-Chunks. Zitiere relevante Wörter/Definitionen namentlich. " +
    "Wenn die Antwort nicht aus dem Code hervorgeht, sag das klar.";

  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Codebase-Kontext:\n\n${context}\n\nFrage: ${query}` },
    ],
  });

  const answer = response.choices[0].message.content;
  console.log("Antwort:\n");
  console.log(answer);
  return answer;
}

const query = process.argv.slice(2).join(" ");
if (!query) {
  console.error("Usage: node rag.js \"<frage>\"");
  process.exit(1);
}
ask(query).catch(err => { console.error(err); process.exit(1); });
