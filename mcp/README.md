# Notes MCP Server

An MCP server that provides tools for interacting with a SQLite database containing notes with vector search capabilities.

## Features

This server exposes three main tools:

### 1. `get_notes_db_schema`

- Returns the complete database schema including tables, columns, data types, and indexes
- No parameters required
- Useful for understanding the database structure

### 2. `query_notes_db`

- Execute read-only SQL queries (SELECT and WITH statements only)
- Parameters:
  - `query`: SQL query string to execute
- Returns query results as JSON

### 3. `search_notes_db`

- Perform semantic search using vector embeddings
- Parameters:
  - `query`: Natural language search query
  - `limit` (optional): Maximum number of results to return (default: 5)
- Uses the nomic-embed-text model for generating embeddings
- Returns matching content with similarity scores

## Database Schema

The server works with a database that has:

- `notes` table: Stores each markdown file. Columns: `id` (PK), `file_path` (unique), `title`, `description`, `content`.
- `tags` table: Stores unique tag strings. Columns: `id` (PK), `name` (unique).
- `notes_tags` table: Junction (many‑to‑many) between notes and tags. Columns: `note_id` (FK -> notes.id), `tag_id` (FK -> tags.id), composite primary key `(note_id, tag_id)`.
- `chunks` table: Text chunks derived from note content for semantic search. Columns: `id` (PK), `note_id` (FK -> notes.id ON DELETE CASCADE), `chunk_index` (ordering within a note), `content`.
- `vec_chunks` virtual table: Vector embeddings for each chunk using `sqlite-vec` (created as `vec0`). Columns: `chunk_id` (matches `chunks.id`, PK), `chunk_embeddings` (float[768]).
- Trigger `delete_chunk_embeddings`: Ensures referential integrity by deleting from `vec_chunks` when a row in `chunks` is removed (emulating ON DELETE CASCADE for the virtual table).

### Indexes

- `idx_notes_file_path` on `notes(file_path)`
- `idx_tags_name` on `tags(name)`

### Ingestion Pipeline Overview

The ingest script (`db/ingest.ts`):

1. Detects added/updated/deleted markdown files via `glob-diff` snapshot.
2. Parses front matter with `gray-matter` (supported keys: `title`, `description`, `tags` (string or array)).
3. Splits note content into overlapping chunks (size 1000, overlap 200) using `RecursiveCharacterTextSplitter`.
4. Generates embeddings for all chunks in a batch via Ollama `nomic-embed-text`.
5. Upserts the note, clears existing chunks & tag links for that note, then:
   - Upserts each tag into `tags` and inserts into `notes_tags`.
   - Inserts each chunk into `chunks` and its embedding into `vec_chunks`.
6. Applies deletes for removed files (note rows cascade to chunks; trigger cleans vectors; tags remain for potential reuse).
7. Commits the transaction and updates the snapshot file.

## Usage

The server runs in stdio mode and can be integrated with MCP-compatible clients.

```json
{
  "mcpServers": {
    "notes-mcp": {
      "command": "node",
      "args": ["mcp/server.ts"]
    }
  }
}
```

## Dependencies

- Requires Ollama with the `nomic-embed-text` model for semantic search
- Uses SQLite with `sqlite-vec` extension for vector operations
- Database file expected at `../notes.db` relative to this directory
