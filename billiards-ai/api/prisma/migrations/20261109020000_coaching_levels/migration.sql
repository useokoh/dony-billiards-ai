-- AlterTable
ALTER TABLE "feedback" ADD COLUMN "target_handicap" INTEGER;

-- AlterTable
ALTER TABLE "recommended_routes" ADD COLUMN "confidence" REAL;
ALTER TABLE "recommended_routes" ADD COLUMN "difficulty" TEXT;
ALTER TABLE "recommended_routes" ADD COLUMN "execution_hint" TEXT;

-- CreateTable
CREATE TABLE "players" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "current_handicap" INTEGER,
    "target_handicap" INTEGER,
    "coaching_level" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

