-- CreateTable
CREATE TABLE "stores" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "billiard_tables" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "store_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "corners" TEXT,
    CONSTRAINT "billiard_tables_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "matches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "table_id" INTEGER NOT NULL,
    "played_at" DATETIME NOT NULL,
    "player1" TEXT,
    "player2" TEXT,
    "video_path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "progress" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "matches_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "billiard_tables" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "innings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "match_id" INTEGER NOT NULL,
    "inning_no" INTEGER NOT NULL,
    CONSTRAINT "innings_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "match_id" INTEGER NOT NULL,
    "inning_id" INTEGER NOT NULL,
    "shot_no" INTEGER NOT NULL,
    "shot_no_in_inning" INTEGER NOT NULL,
    "cue_ball" TEXT NOT NULL,
    "start_sec" REAL NOT NULL,
    "end_sec" REAL NOT NULL,
    "cushion_count" INTEGER NOT NULL DEFAULT 0,
    "hit_order" TEXT,
    "result" TEXT NOT NULL DEFAULT 'unknown',
    "fail_reason" TEXT,
    "score_candidate" BOOLEAN NOT NULL DEFAULT false,
    "score_confirmed" BOOLEAN,
    CONSTRAINT "shots_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shots_inning_id_fkey" FOREIGN KEY ("inning_id") REFERENCES "innings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trajectories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shot_id" INTEGER NOT NULL,
    "frame_no" INTEGER NOT NULL,
    "t_sec" REAL NOT NULL,
    "ball" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "interpolated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "trajectories_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "recommended_routes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shot_id" INTEGER NOT NULL,
    "points" TEXT NOT NULL,
    "cushion_count" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "recommended_routes_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "clips" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "match_id" INTEGER NOT NULL,
    "shot_id" INTEGER,
    "file_path" TEXT NOT NULL,
    "start_sec" REAL NOT NULL,
    "end_sec" REAL NOT NULL,
    CONSTRAINT "clips_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "clips_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "match_id" INTEGER NOT NULL,
    "shot_id" INTEGER,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "feedback_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "shots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "innings_match_id_inning_no_key" ON "innings"("match_id", "inning_no");

-- CreateIndex
CREATE UNIQUE INDEX "shots_match_id_shot_no_key" ON "shots"("match_id", "shot_no");

-- CreateIndex
CREATE INDEX "trajectories_shot_id_frame_no_idx" ON "trajectories"("shot_id", "frame_no");
