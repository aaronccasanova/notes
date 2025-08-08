import * as path from 'node:path'

export const rootDirPath = path.join(import.meta.dirname, '..')

export const notesDBFilePath = path.join(rootDirPath, 'notes.db')

export const notesGlobDiffDirPath = path.join(rootDirPath, '.glob-diff')

export const notesGlobDiffFilePath = path.join(
  notesGlobDiffDirPath,
  'notes.json',
)
