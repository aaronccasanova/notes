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

- `notes` table: Contains note files with their content
- `chunks` table: Contains text chunks from notes for better search
- `vec_chunks` table: Vector embeddings for semantic search using sqlite-vec

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
