import { Router, Request, Response } from 'express';
import prisma from '../utils/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { fetchRate } from '../utils/exchangeRate.js';

const router = Router();
router.use(authMiddleware);

interface CockpitAction {
    id: string;
    type: 'RECHARGE' | 'INFO';
    urgency: 'URGENT' | 'SOON' | 'UPCOMING' | 'OK';
    title: string;
    description: string;
    appleAccountId: number;
    appleAccountEmail: string;
    appleAccountName: string;
    amountKurus: number;
    dueInDays: number;
    subscriptionName: string;
    subscriptionId: number;
}

// GET /api/v1/cockpit
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;

        // Fetch all accounts with their subscriptions and recharges
        const accounts = await prisma.appleAccount.findMany({
            where: { operatorId },
            include: {
                subscriptions: { include: { _count: { select: { tenants: true } } } },
                recharges: true,
            },
        });

        // Fetch exchange rate
        const eurToTry = await fetchRate();

        const now = new Date();
        const today = now.getDate();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const actions: CockpitAction[] = [];
        let totalBalanceKurus = 0;
        let totalMonthlyCostKurus = 0;
        let totalMonthlyRevenueEURCents = 0;

        for (const account of accounts) {
            // Calculate current balance
            const totalRecharges = account.recharges.reduce((sum, r) => sum + r.amountTRYKurus, 0);

            // Calculate total cost since each subscription was created
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
            totalBalanceKurus += currentBalance;

            // For each subscription, check upcoming renewals
            for (const sub of account.subscriptions) {
                // Monthly cost aggregation
                if (sub.renewalFrequency === 'MONTHLY') {
                    totalMonthlyCostKurus += sub.priceTRYKurus;
                    totalMonthlyRevenueEURCents += sub.revenueEURCents;
                } else {
                    totalMonthlyCostKurus += Math.round(sub.priceTRYKurus / 12);
                    totalMonthlyRevenueEURCents += Math.round(sub.revenueEURCents / 12);
                }

                // Calculate days until next renewal
                const renewalDay = sub.renewalDay;
                let nextRenewal: Date;
                const thisMonthRenewal = new Date(currentYear, currentMonth, renewalDay);

                if (thisMonthRenewal > now) {
                    nextRenewal = thisMonthRenewal;
                } else {
                    nextRenewal = new Date(currentYear, currentMonth + 1, renewalDay);
                }

                const daysUntil = Math.ceil((nextRenewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                // Check if balance is sufficient for this renewal
                const balanceAfterRenewal = currentBalance - sub.priceTRYKurus;
                const needsRecharge = balanceAfterRenewal < 0;

                if (needsRecharge && daysUntil <= 7) {
                    const deficit = Math.abs(balanceAfterRenewal);

                    let urgency: CockpitAction['urgency'];
                    if (daysUntil <= 1) urgency = 'URGENT';
                    else if (daysUntil <= 3) urgency = 'SOON';
                    else urgency = 'UPCOMING';

                    actions.push({
                        id: `recharge-${account.id}-${sub.id}`,
                        type: 'RECHARGE',
                        urgency,
                        title: daysUntil <= 1
                            ? `🚨 URGENT — Rechargez ${account.displayName}`
                            : `💰 Rechargez ${account.displayName}`,
                        description: daysUntil <= 1
                            ? `Solde insuffisant pour ${sub.name} (${(sub.priceTRYKurus / 100).toFixed(2)}₺) qui se renouvelle AUJOURD'HUI. Il manque ${(deficit / 100).toFixed(2)}₺.`
                            : `Solde insuffisant pour ${sub.name} (${(sub.priceTRYKurus / 100).toFixed(2)}₺) dans ${daysUntil}j (le ${renewalDay}). Il manque ${(deficit / 100).toFixed(2)}₺.`,
                        appleAccountId: account.id,
                        appleAccountEmail: account.email,
                        appleAccountName: account.displayName,
                        amountKurus: deficit, // Just the deficit — what's actually missing
                        dueInDays: daysUntil,
                        subscriptionName: sub.name,
                        subscriptionId: sub.id,
                    });
                }
            }
        }

        // Sort actions: URGENT first, then SOON, then UPCOMING, then by dueInDays
        const urgencyOrder = { URGENT: 0, SOON: 1, UPCOMING: 2, OK: 3 };
        actions.sort((a, b) => {
            const orderDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
            if (orderDiff !== 0) return orderDiff;
            return a.dueInDays - b.dueInDays;
        });

        // Find next upcoming renewal across all subscriptions
        let nextRenewalInfo = null;
        if (actions.length === 0) {
            // No recharge needed — find the next renewal for display
            let earliestDays = Infinity;
            for (const account of accounts) {
                for (const sub of account.subscriptions) {
                    const thisMonth = new Date(currentYear, currentMonth, sub.renewalDay);
                    const next = thisMonth > now ? thisMonth : new Date(currentYear, currentMonth + 1, sub.renewalDay);
                    const days = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    if (days < earliestDays) {
                        earliestDays = days;
                        nextRenewalInfo = { name: sub.name, daysUntil: days, day: sub.renewalDay, account: account.displayName };
                    }
                }
            }
        }

        // Monthly profit
        const monthlyCostEURCents = Math.round(totalMonthlyCostKurus / eurToTry);
        const monthlyProfitEURCents = totalMonthlyRevenueEURCents - monthlyCostEURCents;

        res.json({
            data: {
                actions,
                summary: {
                    totalBalanceKurus,
                    totalMonthlyCostKurus,
                    totalMonthlyRevenueEURCents,
                    monthlyProfitEURCents,
                    monthlyCostEURCents,
                    eurToTry,
                    accountCount: accounts.length,
                    subscriptionCount: accounts.reduce((s, a) => s + a.subscriptions.length, 0),
                    nextRenewal: nextRenewalInfo,
                },
            },
        });
    } catch (err) {
        logger.error({ err }, 'Failed to compute cockpit');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to compute cockpit' } });
    }
});

export default router;
