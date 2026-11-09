-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "match_id" INTEGER NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "options" TEXT,
    "log_path" TEXT,
    "error_message" TEXT,
    "started_at" DATETIME,
    "finished_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analysis_runs_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shot_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shot_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "frame_no" INTEGER NOT NULL,
    "t_sec" REAL NOT NULL,
    "target" TEXT,
    CONSTRAINT "shot_events_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_feedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "match_id" INTEGER NOT NULL,
    "shot_id" INTEGER,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "message" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "feedback_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_feedback" ("created_at", "id", "kind", "match_id", "message", "shot_id") SELECT "created_at", "id", "kind", "match_id", "message", "shot_id" FROM "feedback";
DROP TABLE "feedback";
ALTER TABLE "new_feedback" RENAME TO "feedback";
CREATE INDEX "feedback_match_id_idx" ON "feedback"("match_id");
CREATE INDEX "feedback_shot_id_idx" ON "feedback"("shot_id");
CREATE TABLE "new_innings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "match_id" INTEGER NOT NULL,
    "inning_no" INTEGER NOT NULL,
    "score_first" INTEGER NOT NULL DEFAULT 0,
    "score_second" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "innings_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_innings" ("id", "inning_no", "match_id") SELECT "id", "inning_no", "match_id" FROM "innings";
DROP TABLE "innings";
ALTER TABLE "new_innings" RENAME TO "innings";
CREATE UNIQUE INDEX "innings_match_id_inning_no_key" ON "innings"("match_id", "inning_no");
CREATE TABLE "new_matches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "table_id" INTEGER NOT NULL,
    "played_at" DATETIME NOT NULL,
    "first_player" TEXT,
    "second_player" TEXT,
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
    CONSTRAINT "matches_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "billiard_tables" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_matches" ("id", "played_at", "progress", "status", "table_id", "video_path") SELECT "id", "played_at", "progress", "status", "table_id", "video_path" FROM "matches";
DROP TABLE "matches";
ALTER TABLE "new_matches" RENAME TO "matches";
CREATE INDEX "matches_table_id_played_at_idx" ON "matches"("table_id", "played_at");
CREATE TABLE "new_recommended_routes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shot_id" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "points" TEXT NOT NULL,
    "cushion_count" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recommended_routes_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_recommended_routes" ("cushion_count", "description", "id", "points", "shot_id") SELECT "cushion_count", "description", "id", "points", "shot_id" FROM "recommended_routes";
DROP TABLE "recommended_routes";
ALTER TABLE "new_recommended_routes" RENAME TO "recommended_routes";
CREATE INDEX "recommended_routes_shot_id_rank_idx" ON "recommended_routes"("shot_id", "rank");
CREATE TABLE "new_shots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "match_id" INTEGER NOT NULL,
    "inning_id" INTEGER NOT NULL,
    "shot_no" INTEGER NOT NULL,
    "shot_no_in_inning" INTEGER NOT NULL,
    "shot_no_in_turn" INTEGER NOT NULL,
    "player" TEXT NOT NULL,
    "cue_ball" TEXT NOT NULL,
    "start_frame" INTEGER NOT NULL,
    "end_frame" INTEGER NOT NULL,
    "start_sec" REAL NOT NULL,
    "end_sec" REAL NOT NULL,
    "rest_sec" REAL,
    "cushion_count" INTEGER NOT NULL DEFAULT 0,
    "cushions_before_second_hit" INTEGER,
    "hit_order" TEXT,
    "result" TEXT NOT NULL DEFAULT 'unknown',
    "fail_reason" TEXT,
    "score_candidate" BOOLEAN NOT NULL DEFAULT false,
    "score_confirmed" BOOLEAN,
    CONSTRAINT "shots_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shots_inning_id_fkey" FOREIGN KEY ("inning_id") REFERENCES "innings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_shots" ("cue_ball", "cushion_count", "end_sec", "fail_reason", "hit_order", "id", "inning_id", "match_id", "result", "score_candidate", "score_confirmed", "shot_no", "shot_no_in_inning", "start_sec") SELECT "cue_ball", "cushion_count", "end_sec", "fail_reason", "hit_order", "id", "inning_id", "match_id", "result", "score_candidate", "score_confirmed", "shot_no", "shot_no_in_inning", "start_sec" FROM "shots";
DROP TABLE "shots";
ALTER TABLE "new_shots" RENAME TO "shots";
CREATE INDEX "shots_inning_id_idx" ON "shots"("inning_id");
CREATE INDEX "shots_match_id_player_idx" ON "shots"("match_id", "player");
CREATE UNIQUE INDEX "shots_match_id_shot_no_key" ON "shots"("match_id", "shot_no");
CREATE TABLE "new_trajectories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shot_id" INTEGER NOT NULL,
    "ball" TEXT NOT NULL,
    "start_frame" INTEGER NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "points" TEXT NOT NULL,
    "estimated" TEXT,
    CONSTRAINT "trajectories_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_trajectories" ("ball", "id", "shot_id") SELECT "ball", "id", "shot_id" FROM "trajectories";
DROP TABLE "trajectories";
ALTER TABLE "new_trajectories" RENAME TO "trajectories";
CREATE UNIQUE INDEX "trajectories_shot_id_ball_key" ON "trajectories"("shot_id", "ball");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "analysis_runs_match_id_created_at_idx" ON "analysis_runs"("match_id", "created_at");

-- CreateIndex
CREATE INDEX "shot_events_shot_id_kind_idx" ON "shot_events"("shot_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "shot_events_shot_id_seq_key" ON "shot_events"("shot_id", "seq");

-- CreateIndex
CREATE INDEX "billiard_tables_store_id_idx" ON "billiard_tables"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "clips_shot_id_key" ON "clips"("shot_id");

-- CreateIndex
CREATE INDEX "clips_match_id_idx" ON "clips"("match_id");
