-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "databaseId" TEXT NOT NULL,
    "databaseName" TEXT,
    "status" TEXT NOT NULL,
    "totalRows" INTEGER,
    "imported" INTEGER,
    "skipped" INTEGER,
    "failed" INTEGER,
    "deduped" INTEGER,
    "keyword" TEXT,
    "actor" TEXT,
    "errors" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
