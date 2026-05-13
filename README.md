# forthrag

RAG (Retrieval-Augmented Generation) für Forth-Codebasen — als MCP-Server für Claude Code.

Der Indexer zerlegt Forth-Quellcode in semantische Chunks (Wortdefinitionen, Deklarationen, Codeblöcke), erzeugt OpenAI-Embeddings und speichert alles lokal. Claude Code kann dann über das Tool `search_forth` direkt in der Codebase suchen.

## Voraussetzungen

- Node.js 18+
- OpenAI API Key

## Installation

```bash
git clone https://github.com/mruess/forthrag.git
cd forthrag
npm install
```

## Index aufbauen

```bash
export OPENAI_API_KEY=sk-...
node indexer.js /pfad/zur/forth-codebase
```

Erzeugt `forth-index.json` im Projektverzeichnis (liegt in `.gitignore`, bleibt lokal).

Unterstützte Dateiendungen: `.f`, `.fs`, `.fth`, `.4th`, `.forth` (Groß-/Kleinschreibung egal).

## Claude Code einrichten

### Option A — Projekt-Settings (empfohlen)

Die Datei `.claude/settings.json` liegt bereits im Repo. Claude Code liest sie automatisch wenn das `forthrag`-Verzeichnis geöffnet ist — kein weiterer Schritt nötig.

Claude Code neu starten, danach steht `search_forth` als Tool zur Verfügung.

### Option B — Global (Server in jeder Session verfügbar)

Den folgenden Abschnitt in `~/.claude.json` eintragen — entweder manuell oder über den Befehl `claude mcp add`:

```json
"mcpServers": {
  "forthrag": {
    "command": "node",
    "args": ["/absoluter/pfad/zu/forthrag/rag.js"],
    "env": {
      "OPENAI_API_KEY": "${OPENAI_API_KEY}"
    }
  }
}
```

`/absoluter/pfad/zu/forthrag/` durch den tatsächlichen Pfad ersetzen. `OPENAI_API_KEY` muss in der Shell-Umgebung gesetzt sein bevor Claude Code gestartet wird.

## Verwendung in Claude Code

Nach dem Neustart von Claude Code einfach in natürlicher Sprache fragen:

- *"Suche in der Forth-Codebase nach Base64-Encoding"*
- *"Wie ist MD5 in Forth implementiert?"*
- *"Welche Wörter gibt es für String-Manipulation?"*

Claude Code ruft automatisch `search_forth` auf und bekommt die relevantesten Code-Chunks als Kontext.

## Projektstruktur

| Datei | Beschreibung |
|---|---|
| `indexer.js` | Liest Forth-Dateien, chunked sie und erzeugt `forth-index.json` |
| `forth-chunker.js` | Forth-aware Chunker (erkennt `: word ... ;`, `VARIABLE`, etc.) |
| `rag.js` | MCP-Server mit `search_forth`-Tool |
| `rag_org.js` | Standalone-Version ohne MCP (direkter CLI-Aufruf) |
| `forth-index.json` | Generierter Embedding-Index (lokal, nicht im Repo) |
