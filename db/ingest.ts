/**
node ~/notes/db/ingest.ts
*/
import * as fs from 'node:fs'

import { globDiff } from 'glob-diff'
import grayMatter from 'gray-matter'
import ollama from 'ollama'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

import { db } from './db.ts'
import {
  notesGlobDiffDirPath,
  notesGlobDiffFilePath,
  rootDirPath,
} from './constants.ts'

const globDiffNotesSnapshotContent = await fs.promises
  .readFile(notesGlobDiffFilePath, 'utf-8')
  .catch(() => '')

const globDiffNotesSnapshot = JSON.parse(globDiffNotesSnapshotContent || '{}')

const { changes, snapshot } = await globDiff(['**/*.md', '!**/node_modules'], {
  cwd: rootDirPath,
  snapshot: globDiffNotesSnapshot,
  saveSnapshot: false,
})

db.exec(/* sql */ `
  create table if not exists notes(
    id integer primary key autoincrement,
    file_path text unique not null,
    title text,
    description text,
    content text
  )
`)

db.exec(/* sql */ `
  create index if not exists idx_notes_file_path on notes(file_path)
`)

db.exec(/* sql */ `
  create table if not exists tags(
    id integer primary key autoincrement,
    name text unique not null
  )
`)

db.exec(/* sql */ `
  create index if not exists idx_tags_name on tags(name)
`)

db.exec(/* sql */ `
  create table if not exists notes_tags(
    note_id integer not null,
    tag_id integer not null,
    primary key (note_id, tag_id),
    foreign key (note_id) references notes(id) on delete cascade,
    foreign key (tag_id) references tags(id) on delete cascade
  )
`)

db.exec(/* sql */ `
  create table if not exists chunks(
    id integer primary key autoincrement,
    note_id integer not null,
    chunk_index integer not null,
    content text not null,
    foreign key (note_id) references notes(id) on delete cascade
  )
`)

db.exec(/* sql */ `
  create virtual table if not exists vec_chunks using vec0(
    chunk_id integer primary key,
    chunk_embeddings float[768]
  )
`)

// Since virtual tables in SQLite don't support foreign key constraints,
// we use a trigger to manually enforce referential integrity. This trigger
// mimics the `ON DELETE CASCADE` behavior, automatically deleting a vector
// from `vec_chunks` when its corresponding note is deleted from `notes`.
db.exec(/* sql */ `
  create trigger if not exists delete_chunk_embeddings
  after delete on chunks
  for each row
  begin
    delete from vec_chunks where chunk_id = OLD.id;
  end;
`)

const upsertNote = db.prepare<
  {
    file_path: string
    title?: string
    description?: string
    content: string
  },
  { id: number }
>(/* sql */ `
  insert into notes (file_path, content, title, description)
  values (:file_path, :content, :title, :description)
  on conflict(file_path) do update set
    content = excluded.content,
    title = excluded.title,
    description = excluded.description
  returning id
`)

const deleteNote = db.prepare<{ file_path: string }>(/* sql */ `
  delete from notes where file_path = :file_path
`)

const upsertTag = db.prepare<{ name: string }, { id: number }>(/* sql */ `
  insert into tags (name)
  values (:name)
  on conflict(name) do update set name = excluded.name
  returning id
`)

const insertNoteTag = db.prepare<{
  note_id: number
  tag_id: number
}>(/* sql */ `
  insert or ignore into notes_tags (note_id, tag_id)
  values (:note_id, :tag_id)
`)

const deleteNotesTagsByNoteId = db.prepare<{ note_id: number }>(/* sql */ `
  delete from notes_tags where note_id = :note_id
`)

const deleteChunksByNoteId = db.prepare<{ note_id: number }>(/* sql */ `
  delete from chunks where note_id = :note_id
`)

const insertChunk = db.prepare<{
  note_id: number
  chunk_index: number
  content: string
}>(/* sql */ `
  insert into chunks (note_id, chunk_index, content)
  values (:note_id, :chunk_index, :content)
`)

const insertVecChunk = db.prepare<{
  chunk_id: bigint
  chunk_embeddings: Float32Array
}>(/* sql */ `
  insert into vec_chunks (chunk_id, chunk_embeddings)
  values (:chunk_id, :chunk_embeddings)
`)

if (!changes.length) {
  console.log('📝 No changes detected')
  process.exit(0)
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
})

console.time('ingest')

db.exec('BEGIN')

console.log(`📝 Processing ${changes.length} change(s)...`)

try {
  for (const change of changes) {
    console.log(`\nProcessing ${change.type}: ${change.filePath}`)

    if (change.type === 'delete') {
      console.log('  Deleting note')

      deleteNote.run({ file_path: change.filePath })
      continue
    }

    const fileContent = await fs.promises.readFile(change.filePath, 'utf-8')

    const { data, content } = grayMatter(fileContent)

    const chunks = await splitter.splitText(content)

    if (!chunks.length) {
      console.log('  Skipping empty file')
      continue
    }

    console.log(`  Embeddings ${chunks.length} chunk(s)...`)

    const embedResponse = await ollama.embed({
      model: 'nomic-embed-text',
      input: chunks,
    })

    const title = typeof data.title === 'string' ? data.title : undefined

    const description =
      typeof data.description === 'string' ? data.description : undefined

    const tags =
      typeof data.tags === 'string'
        ? [data.tags]
        : Array.isArray(data.tags)
          ? data.tags.filter((tag) => typeof tag === 'string')
          : []

    console.log(`  Inserting note...`)

    const noteId = upsertNote.get({
      file_path: change.filePath,
      title,
      description,
      content,
    })?.id

    if (typeof noteId !== 'number') {
      console.error('  Failed to upsert note')
      continue
    }

    // Always delete existing chunks and tags for this note
    deleteChunksByNoteId.run({ note_id: noteId })
    deleteNotesTagsByNoteId.run({ note_id: noteId })

    console.log(`  Inserting ${tags.length} tag(s)...`)

    tags.forEach((tag) => {
      const tagId = upsertTag.get({ name: tag })?.id

      if (typeof tagId !== 'number') return

      insertNoteTag.run({
        note_id: noteId,
        tag_id: tagId,
      })
    })

    console.log(`  Inserting ${chunks.length} chunk(s)...`)

    chunks.forEach((chunk, i) => {
      const chunkId = insertChunk.run({
        note_id: noteId,
        chunk_index: i,
        content: chunk,
      }).lastInsertRowid

      insertVecChunk.run({
        chunk_id: BigInt(chunkId),
        chunk_embeddings: new Float32Array(embedResponse.embeddings[i]!),
      })
    })

    console.log('  ✅ Processed')
  }

  db.exec('COMMIT')

  await fs.promises.mkdir(notesGlobDiffDirPath, { recursive: true })
  await fs.promises.writeFile(notesGlobDiffFilePath, JSON.stringify(snapshot))

  console.log('\n✅ Ingestion complete')
} catch (error) {
  db.exec('ROLLBACK')

  console.error('\n❌ Ingestion failed, rolled back transaction:', error)
  process.exit(1)
}

console.log()
console.timeEnd('ingest')

const stats = {
  creates: changes.filter((c) => c.type === 'create').length,
  updates: changes.filter((c) => c.type === 'update').length,
  deletes: changes.filter((c) => c.type === 'delete').length,
}

console.log(`\nStats:`)
console.log(` • Created: ${stats.creates} notes`)
console.log(` • Updated: ${stats.updates} notes`)
console.log(` • Deleted: ${stats.deletes} notes`)
console.log(` • Total: ${changes.length} change(s) processed`)
