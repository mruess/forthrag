// MCP server — exposes search_forth tool to Claude Code
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

const INDEX_FILE = path.join(import.meta.dirname, "forth-index.json");
const EMBED_MODEL = "nomic-embed-text";
const TOP_K_DEFAULT = 6;

const openai = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
});

let index = null;

function loadIndex() {
  if (index) return index;
  if (!fs.existsSync(INDEX_FILE)) throw new Error(`Index nicht gefunden: ${INDEX_FILE}`);
  index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
  return index;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function searchForth(query, topK = TOP_K_DEFAULT) {
  const idx = loadIndex();
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input: [query] });
  const qVec = res.data[0].embedding;

  return idx
    .map(chunk => ({ ...chunk, score: cosineSimilarity(qVec, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ── MCP Server ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: "forthrag", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_forth",
      description:
        "Durchsucht die Forth-Codebase semantisch und gibt die relevantesten Code-Chunks zurück. " +
        "Nutze dies um Definitionen, Wörter oder Konzepte in der Forth-Codebase zu finden.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Suchanfrage in natürlicher Sprache oder als Forth-Begriff",
          },
          top_k: {
            type: "number",
            description: "Anzahl der zurückgegebenen Chunks (default: 6)",
          },
        },
        required: ["query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "search_forth") {
    throw new Error(`Unbekanntes Tool: ${request.params.name}`);
  }

  const { query, top_k } = request.params.arguments;
  const chunks = await searchForth(query, top_k ?? TOP_K_DEFAULT);

  const text = chunks
    .map((c, i) => {
      const loc = `${c.file}:${c.startLine} [${c.type}]  score: ${c.score.toFixed(4)}`;
      return `### Chunk ${i + 1}  —  ${loc}\n\`\`\`forth\n${c.text}\n\`\`\``;
    })
    .join("\n\n");

  return { content: [{ type: "text", text }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
