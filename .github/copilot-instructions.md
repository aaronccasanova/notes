# Notes MCP Instructions

## Overview

This workspace contains a sophisticated Notes Management System with an accompanying Model Context Protocol (MCP) server that provides powerful vector search and SQL query capabilities. The system automatically ingests markdown files with front matter support, extracts metadata (title, description, tags), chunks content for optimal retrieval, generates embeddings using the `nomic-embed-text` model, and stores everything in a SQLite database with vector search capabilities and a robust tagging system.

## Core Principle: Search Smart, Not Hard

**🎯 Primary Guidance**: Before searching through filesystem or reading multiple files sequentially, always consider using the Notes MCP tools first. They are more token-efficient and often provide better results than traditional file-based searches.

## Available MCP Tools

### 1. `mcp_notes-mcp_search_notes_db` (Semantic Search)

**When to use**: This should be your **first choice** for most information retrieval tasks.

- **Purpose**: Performs semantic search across all notes using vector embeddings
- **Best for**: Natural language queries, conceptual searches, finding related content
- **Parameters**:
  - `query`: Natural language description of what you're looking for
  - `limit`: Number of results (default: 5, increase for broader exploration)
- **Returns**: File paths, content chunks, chunk indices, and similarity scores

**Examples of good queries**:

- "Docker development setup and configuration"
- "React hooks patterns and best practices"
- "system design microservices architecture"
- "meeting notes about API migration"

### 2. `mcp_notes-mcp_query_notes_db` (SQL Queries)

**When to use**: When you need structured data analysis, filtering, or specific database operations.

- **Purpose**: Execute read-only SQL queries against the notes database
- **Best for**: Data analysis, filtering by file paths, counting content, finding specific patterns
- **Supports**: SELECT and WITH statements only (read-only for safety)

**Examples of powerful queries**:

```sql
-- Find all files in a specific directory
SELECT file_path, title, description, length(content) as size
FROM notes
WHERE file_path LIKE '%/templates/%'
ORDER BY size DESC

-- Find notes by tags
SELECT n.file_path, n.title, n.description, GROUP_CONCAT(t.name, ', ') as tags
FROM notes n
JOIN notes_tags nt ON n.id = nt.note_id
JOIN tags t ON nt.tag_id = t.id
WHERE t.name IN ('docker', 'development', 'tutorial')
GROUP BY n.id
ORDER BY n.title

-- Get content statistics by directory
SELECT
  CASE
    WHEN file_path LIKE '%/work/%' THEN 'work'
    WHEN file_path LIKE '%/personal/%' THEN 'personal'
    WHEN file_path LIKE '%/technical/%' THEN 'technical'
    WHEN file_path LIKE '%/templates/%' THEN 'templates'
    ELSE 'other'
  END as category,
  COUNT(*) as file_count,
  AVG(length(content)) as avg_size
FROM notes
GROUP BY category

-- Find notes with specific keywords in path or content
SELECT file_path, title, description, content
FROM notes
WHERE file_path LIKE '%docker%' OR content LIKE '%docker%' OR title LIKE '%docker%'

-- Get all tags with usage counts
SELECT t.name, COUNT(nt.note_id) as usage_count
FROM tags t
LEFT JOIN notes_tags nt ON t.id = nt.tag_id
GROUP BY t.id, t.name
ORDER BY usage_count DESC

-- Find notes without any tags
SELECT file_path, title, description
FROM notes n
LEFT JOIN notes_tags nt ON n.id = nt.note_id
WHERE nt.note_id IS NULL

-- Get all chunks for a specific note (useful for parent document retrieval)
SELECT c.chunk_index, c.content
FROM chunks c
JOIN notes n ON c.note_id = n.id
WHERE n.file_path = '/path/to/specific/file.md'
ORDER BY c.chunk_index
```

### 3. `mcp_notes-mcp_get_notes_db_schema`

**When to use**: When you need to understand the database structure for complex queries.

- **Purpose**: Returns complete database schema with tables, columns, and indexes
- **Best for**: Planning complex SQL queries, understanding data relationships

## Strategic Usage Patterns

### 🚀 Parent Document Retrieval Strategy

This is a highly effective two-step process:

1. **First**: Use semantic search with a higher limit (10-20) to identify relevant files
2. **Then**: Either:
   - Use `read_file` tool to get the complete document, OR
   - Use SQL query to retrieve all chunks for specific files in order

```sql
-- Get complete document by retrieving all chunks in order
SELECT c.content
FROM chunks c
JOIN notes n ON c.note_id = n.id
WHERE n.file_path = '/Users/aaronccasanova/notes/examples/templates/project-kickoff-template.md'
ORDER BY c.chunk_index
```

### 🎯 Multi-Modal Search Approach

Combine different search methods for comprehensive results:

1. **Semantic search** for conceptual matches
2. **SQL queries** for structural/metadata filtering
3. **Traditional file reading** only when you need specific line-level details

### 📊 Content Analysis Patterns

Use SQL for powerful content analysis:

```sql
-- Find largest documents
SELECT file_path, length(content) as size,
       (SELECT COUNT(*) FROM chunks WHERE note_id = notes.id) as chunk_count
FROM notes
ORDER BY size DESC LIMIT 10

-- Search within specific content areas
SELECT DISTINCT n.file_path, n.title, GROUP_CONCAT(t.name, ', ') as tags
FROM notes n
LEFT JOIN notes_tags nt ON n.id = nt.note_id
LEFT JOIN tags t ON nt.tag_id = t.id
WHERE n.file_path LIKE '%/learning/%'
  AND (n.content LIKE '%typescript%' OR n.content LIKE '%javascript%' OR t.name IN ('typescript', 'javascript'))
GROUP BY n.id
```

## Decision Tree: Which Tool When?

```
Need information from notes?
├─ 🔍 Looking for concepts/topics?
│  └─ USE: mcp_notes-mcp_search_notes_db
│
├─ 📊 Need data analysis/filtering?
│  └─ USE: mcp_notes-mcp_query_notes_db
│
├─ 🗂️ Want complete document after finding chunks?
│  └─ USE: Parent document retrieval (search → read_file or SQL)
│
├─ 🏗️ Planning complex queries?
│  └─ USE: mcp_notes-mcp_get_notes_db_schema first
│
└─ 📖 Need specific line numbers or file details?
   └─ USE: Traditional file tools (as last resort)
```

## Database Schema Quick Reference

**Main Tables**:

- `notes`: Complete files (`id`, `file_path`, `title`, `description`, `content`)
- `tags`: Unique tag strings (`id`, `name`)
- `notes_tags`: Junction table linking notes to tags (`note_id`, `tag_id`)
- `chunks`: Text chunks (`id`, `note_id`, `chunk_index`, `content`)
- `vec_chunks`: Vector embeddings for semantic search

**Key Relationships**:

- Each note can have multiple chunks
- Each chunk has a corresponding vector embedding
- Notes can have multiple tags through the junction table
- Tags can be shared across multiple notes
- File paths are relative to the workspace root

## Performance Tips

1. **Token Efficiency**: A single semantic search often replaces 10-25 file reads
2. **Precision**: Use specific queries rather than broad ones
3. **Scope**: Use SQL to filter by directories before semantic search if needed
4. **Iteration**: Start with semantic search, refine with SQL if needed

## Common Anti-Patterns to Avoid

❌ **Don't**: Read 20+ files sequentially to find information
✅ **Do**: Use semantic search with appropriate limit

❌ **Don't**: Use `file_search` or `grep_search` as first attempt
✅ **Do**: Use semantic search for conceptual queries first

❌ **Don't**: Ignore the SQL query capabilities
✅ **Do**: Leverage SQL for filtering, counting, and structured analysis

❌ **Don't**: Use semantic search for exact file path matching
✅ **Do**: Use SQL queries for precise path-based searches

## Example Workflows

### Finding Related Content

```typescript
// 1. Semantic search for concepts
await mcp_notes_mcp_search_notes_db({
  query: 'microservices architecture patterns',
  limit: 10,
})

// 2. If you need full documents, get them via SQL or read_file
// 3. Cross-reference with SQL for metadata analysis
```

### Content Analysis

```sql
-- Understand content distribution
SELECT
  substr(file_path, 1, instr(file_path, '/', 2) + 10) as directory,
  COUNT(*) as files,
  SUM(length(content)) as total_content
FROM notes
GROUP BY substr(file_path, 1, instr(file_path, '/', 2) + 10)
ORDER BY total_content DESC

-- Find largest documents
SELECT file_path, length(content) as size,
       (SELECT COUNT(*) FROM chunks WHERE note_id = notes.id) as chunk_count
FROM notes
ORDER BY size DESC LIMIT 10

-- Search within specific content areas
SELECT DISTINCT n.file_path, n.title, GROUP_CONCAT(t.name, ', ') as tags
FROM notes n
LEFT JOIN notes_tags nt ON n.id = nt.note_id
LEFT JOIN tags t ON nt.tag_id = t.id
WHERE n.file_path LIKE '%/learning/%'
  AND (n.content LIKE '%typescript%' OR n.content LIKE '%javascript%' OR t.name IN ('typescript', 'javascript'))
GROUP BY n.id
```

## Remember

The Notes MCP is designed to be your primary interface for information retrieval in this workspace. Use it intelligently and you'll save significant time and tokens while getting better, more contextually relevant results.
