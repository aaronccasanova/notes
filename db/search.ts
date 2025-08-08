/**
node ~/notes/db/search.ts "Explain Notes MCP"
*/
import ollama from 'ollama'

import { db } from './db.ts'

const query = process.argv.slice(2).join(' ')

if (!query) throw new Error('Expected query argument')

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
    chunks.content,
    matched_chunks.distance
  from matched_chunks
  left join chunks on chunks.id = matched_chunks.chunk_id;
`)

const embedResponse = await ollama.embed({
  model: 'nomic-embed-text',
  input: query,
})

const chunks = searchChunks.all({
  query_embeddings: new Float32Array(embedResponse.embeddings[0]!),
  k: 3,
})

console.log(`Query: "${query}"`)

console.log('Chunks:')
console.log(chunks)
