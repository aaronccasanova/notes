import ollama from 'ollama'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { db } from '../db/db.ts'

// Set database to readonly mode
db.pragma('query_only = 1')

const server = new McpServer({
  name: 'notes-mcp',
  version: '0.0.0',
})

// Tool 1: Schema Introspection
server.registerTool(
  'get_notes_db_schema',
  {
    title: 'Get Notes Database Schema',
    description:
      'Introspect the personal notes knowledge base structure (tables, columns, indexes) before crafting other queries. Use to discover how notes, tags, chunks, and embeddings are organized so later SELECT or semantic searches can be more precise and aligned with user conventions (filenames, tagging patterns, chunk granularity). Returns full DDL plus column metadata.',
  },
  async () => {
    try {
      // Get all tables
      const tables = db
        .prepare(
          /* sql */ `
            select
              name,
              sql
            from sqlite_master
            where type = 'table'
            and name not like 'sqlite_%'
            order by name
          `,
        )
        .all() as Array<{ name: string; sql: string }>

      // Get all indexes
      const indexes = db
        .prepare(
          /* sql */ `
            select
              name,
              sql
            from sqlite_master
            where type = 'index'
            and name not like 'sqlite_%'
            order by name
          `,
        )
        .all() as Array<{ name: string; sql: string }>

      // Get detailed column info for each table
      const schema: {
        tables: {
          [tableName: string]: {
            sql: string
            columns: Array<{
              name: string
              type: string
              nullable: boolean
              default: any
              primaryKey: boolean
            }>
          }
        }
        indexes: Array<{ name: string; sql: string }>
      } = {
        tables: {},
        indexes: indexes.map((idx) => ({
          name: idx.name,
          sql: idx.sql,
        })),
      }

      for (const table of tables) {
        interface TableInfo {
          name: string
          type: string
          notnull: number
          dflt_value: any
          pk: number
        }

        const columns = db
          .prepare(/* sql */ `pragma table_info(${table.name})`)
          .all() as Array<TableInfo>

        schema.tables[table.name] = {
          sql: table.sql,
          columns: columns.map((column) => ({
            name: column.name,
            type: column.type,
            nullable: !column.notnull,
            default: column.dflt_value,
            primaryKey: column.pk === 1,
          })),
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(schema, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error retrieving schema: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      }
    }
  },
)

// Tool 2: SQL Query (Read-only)
server.registerTool(
  'query_notes_db',
  {
    title: 'Query Notes Database',
    description:
      'Run targeted read-only SQL (SELECT / WITH) over the personal notes knowledge base to retrieve structured info (e.g. list note file paths, filter by tag via joins, inspect chunk indices, surface titles/descriptions). Use when you need exact fields, relationships, or to ground actions in user-authored data rather than relying on inference. Mutations are blocked; returns JSON rows.',
    inputSchema: {
      query: z
        .string()
        .describe('SQL query to execute (SELECT statements only)'),
    },
  },
  async ({ query }) => {
    try {
      // Basic safety check - only allow SELECT statements
      const trimmedQuery = query.trim().toLowerCase()

      if (
        !trimmedQuery.startsWith('select') &&
        !trimmedQuery.startsWith('with')
      ) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Error: Only SELECT and WITH statements are allowed',
            },
          ],
        }
      }

      const results = db.prepare(query).all()

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error executing query: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      }
    }
  },
)

// Tool 3: Semantic Search
server.registerTool(
  'search_notes_db',
  {
    title: 'Search Notes Database',
    description: `Semantic (embedding) search across all chunked note content (work, personal, style guides, preferences, boilerplates, code patterns). Use to quickly surface context, conventions, or examples to align responses and decisions with the user's established practices when exact SQL filtering is unnecessary or wording varies. Returns chunks with similarity scores.`,
    inputSchema: {
      query: z.string().describe('Natural language search query'),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of results to return (default: 5)'),
    },
  },
  async ({ query, limit = 5 }) => {
    try {
      // Generate embedding for the search query
      const embedResponse = await ollama.embed({
        model: 'nomic-embed-text',
        input: query,
      })

      const embedding = embedResponse.embeddings[0]

      if (!embedding) {
        throw new Error('Failed to generate embedding for query')
      }

      // Search for similar chunks
      const searchChunks = db.prepare(/* sql */ `
        with matched_chunks as (
          select
            chunk_id,
            distance
          from vec_chunks
          where chunk_embeddings match :query_embeddings
          order by distance
          limit :k
        )
        select
          notes.file_path,
          chunks.content,
          chunks.chunk_index,
          matched_chunks.distance
        from matched_chunks
        left join chunks on chunks.id = matched_chunks.chunk_id
        left join notes on notes.id = chunks.note_id
        order by matched_chunks.distance
      `)

      const results = searchChunks.all({
        query_embeddings: new Float32Array(embedding),
        k: limit,
      }) as Array<{
        file_path: string
        content: string
        chunk_index: number
        distance: number
      }>

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              results.map((result) => ({
                file_path: result.file_path,
                content: result.content,
                chunk_index: result.chunk_index,
                similarity_score: 1 - result.distance, // Convert distance to similarity
              })),
              null,
              2,
            ),
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error performing semantic search: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      }
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
