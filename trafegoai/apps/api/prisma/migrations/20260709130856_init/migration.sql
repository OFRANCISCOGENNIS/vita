-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'PRO', 'AGENCY');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'CLIENT_VIEWER');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('GOOGLE', 'META', 'TIKTOK');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MetricLevel" AS ENUM ('ACCOUNT', 'CAMPAIGN', 'ADSET', 'AD');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'APPLIED', 'DISMISSED', 'UNDONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "brandLogoUrl" TEXT,
    "brandColor" TEXT DEFAULT '#6366f1',
    "customDomain" TEXT,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,
    "platform" "Platform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusDetail" TEXT,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "objective" TEXT,
    "budgetDaily" DECIMAL(12,2),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSet" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "targeting" JSONB,

    CONSTRAINT "AdSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "creativeId" TEXT,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricDaily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "level" "MetricLevel" NOT NULL,
    "refId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "spend" DECIMAL(14,2) NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "conversions" INTEGER NOT NULL,
    "frequency" DECIMAL(8,4),

    CONSTRAINT "MetricDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HourlyPerformance" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "spend" DECIMAL(14,2) NOT NULL,
    "conversions" INTEGER NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "HourlyPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creative" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "headline" TEXT NOT NULL,
    "primaryText" TEXT,
    "description" TEXT,
    "cta" TEXT,
    "imageUrl" TEXT,
    "angle" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "impactEstimate" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "payload" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anomaly" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT,
    "severity" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Anomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metric" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" DECIMAL(12,2) NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 3,
    "action" TEXT NOT NULL,
    "actionValue" DECIMAL(12,2),
    "scope" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleExecution" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "detail" TEXT NOT NULL,

    CONSTRAINT "RuleExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,
    "month" TEXT NOT NULL,
    "targetRoas" DECIMAL(8,2),
    "targetCpa" DECIMAL(12,2),
    "monthlyBudget" DECIMAL(14,2),

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "schedule" TEXT NOT NULL DEFAULT 'NONE',
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shareToken" TEXT NOT NULL,
    "brand" JSONB,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_platform_externalId_orgId_key" ON "AdAccount"("platform", "externalId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_accountId_externalId_key" ON "Campaign"("accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSet_campaignId_externalId_key" ON "AdSet"("campaignId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_adSetId_externalId_key" ON "Ad"("adSetId", "externalId");

-- CreateIndex
CREATE INDEX "MetricDaily_accountId_date_idx" ON "MetricDaily"("accountId", "date");

-- CreateIndex
CREATE INDEX "MetricDaily_level_refId_date_idx" ON "MetricDaily"("level", "refId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MetricDaily_date_level_refId_key" ON "MetricDaily"("date", "level", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "HourlyPerformance_accountId_dayOfWeek_hour_key" ON "HourlyPerformance"("accountId", "dayOfWeek", "hour");

-- CreateIndex
CREATE INDEX "Recommendation_orgId_status_priority_idx" ON "Recommendation"("orgId", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_orgId_clientId_month_key" ON "Goal"("orgId", "clientId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Report_shareToken_key" ON "Report"("shareToken");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSet" ADD CONSTRAINT "AdSet_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "AdSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricDaily" ADD CONSTRAINT "MetricDaily_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourlyPerformance" ADD CONSTRAINT "HourlyPerformance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleExecution" ADD CONSTRAINT "RuleExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
