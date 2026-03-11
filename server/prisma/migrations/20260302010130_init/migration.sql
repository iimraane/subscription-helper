-- CreateTable
CREATE TABLE "Operator" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPERATOR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "AppleAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "operatorId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppleAccount_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SharingPlatformAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "operatorId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SharingPlatformAccount_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "appleAccountId" INTEGER NOT NULL,
    "sharingPlatformAccountId" INTEGER,
    "name" TEXT NOT NULL,
    "priceTRYKurus" INTEGER NOT NULL,
    "priceEURCents" INTEGER NOT NULL,
    "renewalDay" INTEGER NOT NULL,
    "renewalFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_appleAccountId_fkey" FOREIGN KEY ("appleAccountId") REFERENCES "AppleAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_sharingPlatformAccountId_fkey" FOREIGN KEY ("sharingPlatformAccountId") REFERENCES "SharingPlatformAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sharingPlatformAccountId" INTEGER NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    CONSTRAINT "Tenant_sharingPlatformAccountId_fkey" FOREIGN KEY ("sharingPlatformAccountId") REFERENCES "SharingPlatformAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tenant_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recharge" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "appleAccountId" INTEGER NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "amountTRYKurus" INTEGER NOT NULL,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recharge_appleAccountId_fkey" FOREIGN KEY ("appleAccountId") REFERENCES "AppleAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recharge_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "operatorId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionType" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "operatorId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_email_key" ON "Operator"("email");

-- CreateIndex
CREATE INDEX "AppleAccount_operatorId_idx" ON "AppleAccount"("operatorId");

-- CreateIndex
CREATE INDEX "SharingPlatformAccount_operatorId_idx" ON "SharingPlatformAccount"("operatorId");

-- CreateIndex
CREATE INDEX "Subscription_appleAccountId_idx" ON "Subscription"("appleAccountId");

-- CreateIndex
CREATE INDEX "Subscription_sharingPlatformAccountId_idx" ON "Subscription"("sharingPlatformAccountId");

-- CreateIndex
CREATE INDEX "Tenant_sharingPlatformAccountId_idx" ON "Tenant"("sharingPlatformAccountId");

-- CreateIndex
CREATE INDEX "Tenant_subscriptionId_idx" ON "Tenant"("subscriptionId");

-- CreateIndex
CREATE INDEX "Recharge_appleAccountId_idx" ON "Recharge"("appleAccountId");

-- CreateIndex
CREATE INDEX "Recharge_operatorId_idx" ON "Recharge"("operatorId");

-- CreateIndex
CREATE INDEX "Notification_operatorId_idx" ON "Notification"("operatorId");

-- CreateIndex
CREATE INDEX "PushSubscription_operatorId_idx" ON "PushSubscription"("operatorId");
