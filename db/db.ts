import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

import { notesDBFilePath } from './constants.ts'

export const db = new Database(notesDBFilePath)

sqliteVec.load(db)

db.pragma('journal_mode = WAL')
