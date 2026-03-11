import cron from 'node-cron';
import prisma from '../utils/prisma.js';
import { sendPushToOperator, isPushEnabled } from '../utils/pushService.js';
import logger from '../utils/logger.js';
import { scanAllMailboxes } from './gmailWorker.js';

/**
 * Notification Scheduler — runs every hour to check upcoming renewals.
 * Gmail Worker — runs every 15 minutes to scan connected mailboxes.
 */
export function startNotificationScheduler(): void {
    if (!isPushEnabled()) {
        logger.warn('Push not configured — notification scheduler disabled');
    } else {
        // Renewal notifications: every hour
        cron.schedule('0 * * * *', async () => {
            logger.info('Running notification scheduler...');
            try { await checkAndNotify(); }
            catch (err) { logger.error({ err }, 'Notification scheduler error'); }
        });

        setTimeout(async () => {
            try { await checkAndNotify(); }
            catch (err) { logger.error({ err }, 'Initial notification check error'); }
        }, 10000);

        logger.info('Notification scheduler started (every hour)');
    }

    // Gmail worker: every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        try { await scanAllMailboxes(); }
        catch (err) { logger.error({ err }, 'Gmail worker error'); }
    });
    logger.info('Gmail worker scheduled (every 15 min)');

    // Daily Digest: every day at 09:00
    cron.schedule('0 9 * * *', async () => {
        try { await sendDailyDigest(); }
        catch (err) { logger.error({ err }, 'Daily Digest error'); }
    });
    logger.info('Daily Digest scheduled (every day at 09:00)');
}

async function checkAndNotify(): Promise<void> {
    const operators = await prisma.operator.findMany({
        select: { id: true },
    });

    for (const operator of operators) {
        await checkOperatorRenewals(operator.id);
    }
}

async function checkOperatorRenewals(operatorId: number): Promise<void> {
    const accounts = await prisma.appleAccount.findMany({
        where: { operatorId },
        include: {
            subscriptions: true,
            recharges: true,
        },
    });

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    for (const account of accounts) {
        // Calculate current balance
        const totalRecharges = account.recharges.reduce((sum, r) => sum + r.amountTRYKurus, 0);
        let totalCosts = 0;
        for (const sub of account.subscriptions) {
            const created = new Date(sub.createdAt);
            const monthsSince = Math.max(0,
                (currentYear - created.getFullYear()) * 12 + (currentMonth - created.getMonth())
            );
            if (sub.renewalFrequency === 'YEARLY') {
                totalCosts += sub.priceTRYKurus * Math.floor(monthsSince / 12);
            } else {
                totalCosts += sub.priceTRYKurus * monthsSince;
            }
        }
        const currentBalance = account.initialBalanceKurus + totalRecharges - totalCosts;

        for (const sub of account.subscriptions) {
            const renewalDay = sub.renewalDay;
            const thisMonth = new Date(currentYear, currentMonth, renewalDay);
            const nextRenewal = thisMonth > now ? thisMonth : new Date(currentYear, currentMonth + 1, renewalDay);
            const hoursUntil = (nextRenewal.getTime() - now.getTime()) / (1000 * 60 * 60);

            const balanceAfter = currentBalance - sub.priceTRYKurus;
            if (balanceAfter >= 0) continue; // Sufficient balance, skip

            const deficit = Math.abs(balanceAfter);
            const deficitTRY = (deficit / 100).toFixed(2);

            // Check for already-sent notification (avoid spam)
            const recentNotif = await prisma.notification.findFirst({
                where: {
                    operatorId,
                    type: hoursUntil <= 24 ? 'RECHARGE_URGENT' : 'RECHARGE_DUE',
                    title: { contains: sub.name },
                    createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) }, // within 12h
                },
            });

            if (recentNotif) continue; // Already notified

            let title: string;
            let body: string;
            let type: string;

            if (hoursUntil <= 24) {
                // URGENT — renewal today/tomorrow
                type = 'RECHARGE_URGENT';
                title = `⚠️ URGENT — ${account.displayName}`;
                body = `Solde insuffisant pour ${sub.name} prévu aujourd'hui. Rechargez min. ${deficitTRY}₺.`;
            } else if (hoursUntil <= 48) {
                // DUE — renewal in ~24-48h
                type = 'RECHARGE_DUE';
                title = `Rechargez ${account.displayName}`;
                body = `${sub.name} se renouvelle dans ${Math.round(hoursUntil)}h. Il manque ${deficitTRY}₺.`;
            } else {
                continue; // Too far away
            }

            // Save notification record
            await prisma.notification.create({
                data: {
                    operatorId,
                    type,
                    title,
                    body,
                    actionType: 'RECHARGE',
                },
            });

            // Send push — sanitized payload (no passwords, no account IDs)
            await sendPushToOperator(operatorId, {
                title,
                body,
                tag: `recharge-${account.id}-${sub.id}`,
                url: '/',
            });

            logger.info({ operatorId, type, sub: sub.name }, 'Notification sent');
        }
    }
}

async function sendDailyDigest(): Promise<void> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const unreadMessages = await prisma.gmailAuditLog.groupBy({
        by: ['operatorId'],
        where: {
            isRead: false,
            eventType: { in: ['INFO', 'RENEWAL'] },
            receivedAt: { gte: yesterday }
        },
        _count: { id: true }
    });

    for (const group of unreadMessages) {
        if (group._count.id > 0) {
            await sendPushToOperator(group.operatorId, {
                title: '📰 Résumé quotidien',
                body: `Vous avez ${group._count.id} nouveau(x) message(s) d'information. Consultez votre Inbox.`,
                tag: 'daily-digest',
                url: '/gmail',
            });
            logger.info({ operatorId: group.operatorId, count: group._count.id }, 'Daily Digest sent');
        }
    }
}
