import { Router, Request, Response } from 'express';
import prisma from '../utils/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { fetchRate } from '../utils/exchangeRate.js';

const router = Router();
router.use(authMiddleware);

// GET /api/v1/finance — Monthly financial summary + history
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;

        const accounts = await prisma.appleAccount.findMany({
            where: { operatorId },
            include: {
                subscriptions: true,
                recharges: true,
            },
        });

        // Exchange rate
        const eurToTry = await fetchRate();

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Build per-month history (last 12 months)
        const months: Array<{
            month: string; label: string;
            costKurus: number; revenueEURCents: number; rechargeTotalKurus: number;
            profitEURCents: number; subscriptions: Array<{ name: string; costKurus: number; revenueEURCents: number }>;
        }> = [];

        for (let i = 0; i < 12; i++) {
            const mDate = new Date(currentYear, currentMonth - i, 1);
            const m = mDate.getMonth();
            const y = mDate.getFullYear();
            const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
            const monthLabel = mDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

            let monthCostKurus = 0;
            let monthRevenueEURCents = 0;
            let monthRechargeKurus = 0;
            const subDetails: Array<{ name: string; costKurus: number; revenueEURCents: number }> = [];

            for (const account of accounts) {
                // Recharges in this month
                for (const r of account.recharges) {
                    const rd = new Date(r.confirmedAt);
                    if (rd.getMonth() === m && rd.getFullYear() === y) {
                        monthRechargeKurus += r.amountTRYKurus;
                    }
                }

                // Subscriptions active in this month
                for (const sub of account.subscriptions) {
                    const created = new Date(sub.createdAt);
                    if (created > new Date(y, m + 1, 0)) continue; // Sub didn't exist yet

                    if (sub.renewalFrequency === 'YEARLY') {
                        // Only count in the renewal month
                        const createdMonth = created.getMonth();
                        if (m === createdMonth) {
                            monthCostKurus += sub.priceTRYKurus;
                            monthRevenueEURCents += sub.revenueEURCents;
                            subDetails.push({ name: sub.name, costKurus: sub.priceTRYKurus, revenueEURCents: sub.revenueEURCents });
                        }
                    } else {
                        monthCostKurus += sub.priceTRYKurus;
                        monthRevenueEURCents += sub.revenueEURCents;
                        subDetails.push({ name: sub.name, costKurus: sub.priceTRYKurus, revenueEURCents: sub.revenueEURCents });
                    }
                }
            }

            const costEURCents = Math.round(monthCostKurus / eurToTry);
            const profitEURCents = monthRevenueEURCents - costEURCents;

            months.push({
                month: monthKey, label: monthLabel,
                costKurus: monthCostKurus, revenueEURCents: monthRevenueEURCents,
                rechargeTotalKurus: monthRechargeKurus, profitEURCents,
                subscriptions: subDetails,
            });
        }

        // Current month summary
        const current = months[0];

        // Grand totals
        const totalRevenueEURCents = months.reduce((s, m) => s + m.revenueEURCents, 0);
        const totalCostKurus = months.reduce((s, m) => s + m.costKurus, 0);
        const totalProfitEURCents = months.reduce((s, m) => s + m.profitEURCents, 0);

        res.json({
            data: {
                current,
                history: months,
                totals: {
                    revenueEURCents: totalRevenueEURCents,
                    costKurus: totalCostKurus,
                    profitEURCents: totalProfitEURCents,
                    months: months.length,
                },
                eurToTry,
            }
        });
    } catch (err) {
        logger.error({ err }, 'Failed to compute finance');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to compute finance' } });
    }
});

export default router;
