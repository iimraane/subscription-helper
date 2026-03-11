/*
  Warnings:

  - You are about to drop the column `priceEURCents` on the `Subscription` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppleAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "operatorId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "initialBalanceKurus" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppleAccount_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AppleAccount" ("createdAt", "displayName", "email", "encryptedPassword", "id", "operatorId", "updatedAt") SELECT "createdAt", "displayName", "email", "encryptedPassword", "id", "operatorId", "updatedAt" FROM "AppleAccount";
DROP TABLE "AppleAccount";
ALTER TABLE "new_AppleAccount" RENAME TO "AppleAccount";
CREATE INDEX "AppleAccount_operatorId_idx" ON "AppleAccount"("operatorId");
CREATE TABLE "new_Subscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "appleAccountId" INTEGER NOT NULL,
    "sharingPlatformAccountId" INTEGER,
    "name" TEXT NOT NULL,
    "priceTRYKurus" INTEGER NOT NULL,
    "revenueEURCents" INTEGER NOT NULL DEFAULT 0,
    "renewalDay" INTEGER NOT NULL,
    "renewalFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_appleAccountId_fkey" FOREIGN KEY ("appleAccountId") REFERENCES "AppleAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_sharingPlatformAccountId_fkey" FOREIGN KEY ("sharingPlatformAccountId") REFERENCES "SharingPlatformAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" ("appleAccountId", "createdAt", "id", "name", "priceTRYKurus", "renewalDay", "renewalFrequency", "sharingPlatformAccountId", "updatedAt") SELECT "appleAccountId", "createdAt", "id", "name", "priceTRYKurus", "renewalDay", "renewalFrequency", "sharingPlatformAccountId", "updatedAt" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE INDEX "Subscription_appleAccountId_idx" ON "Subscription"("appleAccountId");
CREATE INDEX "Subscription_sharingPlatformAccountId_idx" ON "Subscription"("sharingPlatformAccountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
