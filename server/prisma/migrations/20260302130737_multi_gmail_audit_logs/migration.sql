/*
  Warnings:

  - A unique constraint covering the columns `[operatorId,gmailAddress]` on the table `GmailOAuth` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "GmailOAuth_operatorId_key";

-- AlterTable
ALTER TABLE "GmailOAuth" ADD COLUMN "lastCheckedAt" DATETIME;

-- CreateTable
CREATE TABLE "GmailAuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gmailOAuthId" INTEGER NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT,
    "receivedAt" DATETIME NOT NULL,
    "domain" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventSummary" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GmailAuditLog_gmailOAuthId_fkey" FOREIGN KEY ("gmailOAuthId") REFERENCES "GmailOAuth" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GmailAuditLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GmailAuditLog_operatorId_idx" ON "GmailAuditLog"("operatorId");

-- CreateIndex
CREATE INDEX "GmailAuditLog_gmailOAuthId_idx" ON "GmailAuditLog"("gmailOAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "GmailAuditLog_gmailOAuthId_gmailMessageId_key" ON "GmailAuditLog"("gmailOAuthId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "GmailOAuth_operatorId_idx" ON "GmailOAuth"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "GmailOAuth_operatorId_gmailAddress_key" ON "GmailOAuth"("operatorId", "gmailAddress");
