-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_matches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "table_id" INTEGER NOT NULL,
    "played_at" DATETIME NOT NULL,
    "first_player" TEXT,
    "second_player" TEXT,
    "first_player_id" INTEGER,
    "second_player_id" INTEGER,
    "first_cue_ball" TEXT,
    "video_path" TEXT NOT NULL,
    "fps" REAL,
    "duration_sec" REAL,
    "corners" TEXT,
    "track_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "score_first" INTEGER NOT NULL DEFAULT 0,
    "score_second" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "matches_first_player_id_fkey" FOREIGN KEY ("first_player_id") REFERENCES "players" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "matches_second_player_id_fkey" FOREIGN KEY ("second_player_id") REFERENCES "players" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "matches_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "billiard_tables" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_matches" ("corners", "created_at", "duration_sec", "error_message", "first_cue_ball", "first_player", "fps", "id", "played_at", "progress", "score_first", "score_second", "second_player", "status", "table_id", "track_path", "updated_at", "video_path") SELECT "corners", "created_at", "duration_sec", "error_message", "first_cue_ball", "first_player", "fps", "id", "played_at", "progress", "score_first", "score_second", "second_player", "status", "table_id", "track_path", "updated_at", "video_path" FROM "matches";
DROP TABLE "matches";
ALTER TABLE "new_matches" RENAME TO "matches";
CREATE INDEX "matches_table_id_played_at_idx" ON "matches"("table_id", "played_at");
CREATE INDEX "matches_first_player_id_idx" ON "matches"("first_player_id");
CREATE INDEX "matches_second_player_id_idx" ON "matches"("second_player_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

