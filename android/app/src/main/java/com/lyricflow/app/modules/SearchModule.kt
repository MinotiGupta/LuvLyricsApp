package com.lyricflow.app.modules

import android.database.sqlite.SQLiteDatabase
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class SearchModule : Module() {

    override fun definition() = ModuleDefinition {
        Name("Search")

        // Creates the FTS5 virtual table if it doesn't exist and rebuilds its index.
        // Idempotent — safe to call on every app launch.
        AsyncFunction("ensureIndex") {
            withContext(Dispatchers.IO) {
                openDb()?.use { db ->
                    db.execSQL(
                        """CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(
                            id UNINDEXED,
                            title,
                            artist,
                            album,
                            content=songs,
                            content_rowid=rowid
                        )"""
                    )
                    // Rebuild syncs the FTS index with the current songs table contents.
                    db.execSQL("INSERT INTO songs_fts(songs_fts) VALUES('rebuild')")
                }
            }
        }

        // Returns a JSON string — array of song objects matching the query.
        // Append '*' to the query before calling for prefix matching.
        AsyncFunction("search") { query: String ->
            withContext(Dispatchers.IO) {
                if (query.isBlank()) return@withContext "[]"
                val db = openDb() ?: return@withContext "[]"
                db.use {
                    buildResults(it, query)
                }
            }
        }
    }

    private fun openDb(): SQLiteDatabase? {
        val context = appContext.reactContext ?: return null
        val dbFile = context.getDatabasePath("lyricflow.db")
        if (!dbFile.exists()) return null
        return try {
            SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
        } catch (_: Exception) { null }
    }

    private fun buildResults(db: SQLiteDatabase, query: String): String {
        val results = JSONArray()
        db.rawQuery(
            """SELECT s.id, s.title, s.artist, s.album, s.gradient_id, s.duration,
                      s.date_created, s.date_modified, s.play_count, s.last_played,
                      s.scroll_speed, s.cover_image_uri, s.lyrics_align, s.text_case,
                      s.audio_uri, s.is_liked
               FROM songs s
               JOIN songs_fts ON songs_fts.id = s.id
               WHERE songs_fts MATCH ?
                 AND s.is_hidden = 0
               ORDER BY rank
               LIMIT 100""",
            arrayOf(query)
        ).use { c ->
            val colId          = c.getColumnIndex("id")
            val colTitle       = c.getColumnIndex("title")
            val colArtist      = c.getColumnIndex("artist")
            val colAlbum       = c.getColumnIndex("album")
            val colGradient    = c.getColumnIndex("gradient_id")
            val colDuration    = c.getColumnIndex("duration")
            val colCreated     = c.getColumnIndex("date_created")
            val colModified    = c.getColumnIndex("date_modified")
            val colPlayCount   = c.getColumnIndex("play_count")
            val colLastPlayed  = c.getColumnIndex("last_played")
            val colScrollSpeed = c.getColumnIndex("scroll_speed")
            val colCoverUri    = c.getColumnIndex("cover_image_uri")
            val colLyricsAlign = c.getColumnIndex("lyrics_align")
            val colTextCase    = c.getColumnIndex("text_case")
            val colAudioUri    = c.getColumnIndex("audio_uri")
            val colIsLiked     = c.getColumnIndex("is_liked")

            while (c.moveToNext()) {
                val s = JSONObject()
                s.put("id",            str(c, colId) ?: continue)
                s.put("title",         str(c, colTitle) ?: "")
                s.put("artist",        strOrNull(c, colArtist))
                s.put("album",         strOrNull(c, colAlbum))
                s.put("gradientId",    str(c, colGradient) ?: "blue")
                s.put("duration",      if (colDuration >= 0) c.getInt(colDuration) else 0)
                s.put("dateCreated",   str(c, colCreated) ?: "")
                s.put("dateModified",  str(c, colModified) ?: "")
                s.put("playCount",     if (colPlayCount >= 0) c.getInt(colPlayCount) else 0)
                s.put("lastPlayed",    strOrNull(c, colLastPlayed))
                s.put("scrollSpeed",   if (colScrollSpeed >= 0) c.getInt(colScrollSpeed) else 50)
                s.put("coverImageUri", strOrNull(c, colCoverUri))
                s.put("lyricsAlign",   str(c, colLyricsAlign) ?: "left")
                s.put("textCase",      str(c, colTextCase) ?: "titlecase")
                s.put("audioUri",      strOrNull(c, colAudioUri))
                s.put("isLiked",       colIsLiked >= 0 && !c.isNull(colIsLiked) && c.getInt(colIsLiked) == 1)
                s.put("isHidden",      false)
                s.put("lyrics",        JSONArray())
                results.put(s)
            }
        }
        return results.toString()
    }

    private fun str(c: android.database.Cursor, col: Int): String? =
        if (col >= 0 && !c.isNull(col)) c.getString(col) else null

    private fun strOrNull(c: android.database.Cursor, col: Int): Any =
        if (col >= 0 && !c.isNull(col)) c.getString(col) else JSONObject.NULL
}
