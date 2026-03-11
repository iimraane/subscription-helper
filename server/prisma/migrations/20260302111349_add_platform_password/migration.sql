-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SharingPlatformAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "operatorId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL DEFAULT '',
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SharingPlatformAccount_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SharingPlatformAccount" ("createdAt", "displayName", "email", "id", "operatorId", "platform", "updatedAt") SELECT "createdAt", "displayName", "email", "id", "operatorId", "platform", "updatedAt" FROM "SharingPlatformAccount";
DROP TABLE "SharingPlatformAccount";
ALTER TABLE "new_SharingPlatformAccount" RENAME TO "SharingPlatformAccount";
CREATE INDEX "SharingPlatformAccount_operatorId_idx" ON "SharingPlatformAccount"("operatorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
