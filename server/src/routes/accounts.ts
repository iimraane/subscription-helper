import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = Router();
router.use(authMiddleware);

const createAccountSchema = z.object({
    email: z.string().email('Invalid email format'),
    displayName: z.string().min(1, 'Display name is required'),
    initialBalanceKurus: z.number().int().min(0).optional(),
});

const updateAccountSchema = z.object({
    email: z.string().email('Invalid email format').optional(),
    displayName: z.string().min(1).optional(),
    initialBalanceKurus: z.number().int().min(0).optional(),
});

const rechargeSchema = z.object({
    amountTRYKurus: z.number().int().min(1, 'Amount must be positive'),
});

// GET /api/v1/accounts
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;

        const accounts = await prisma.appleAccount.findMany({
            where: { operatorId },
            include: {
                subscriptions: {
                    select: { priceTRYKurus: true, renewalFrequency: true, revenueEURCents: true, name: true, renewalDay: true },
                },
                recharges: { select: { amountTRYKurus: true } },
                _count: { select: { subscriptions: true, recharges: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const result = accounts.map((account) => {
            const totalRecharges = account.recharges.reduce((sum, r) => sum + r.amountTRYKurus, 0);

            let totalCosts = 0;
            let monthlyCostKurus = 0;
            let next7DaysCostKurus = 0;

            for (const sub of account.subscriptions) {
                // Monthly cost
                if (sub.renewalFrequency === 'YEARLY') {
                    monthlyCostKurus += Math.round(sub.priceTRYKurus / 12);
                } else {
                    monthlyCostKurus += sub.priceTRYKurus;
                }

                // Next 7 days cost
                const renewDay = sub.renewalDay;
                const thisMonth = new Date(now.getFullYear(), now.getMonth(), renewDay);
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, renewDay);
                const nextRenewal = thisMonth > now ? thisMonth : nextMonth;
                const daysUntil = Math.ceil((nextRenewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (daysUntil <= 7 && sub.renewalFrequency === 'MONTHLY') {
                    next7DaysCostKurus += sub.priceTRYKurus;
                } else if (daysUntil <= 7 && sub.renewalFrequency === 'YEARLY') {
                    // Yearly: check if renewal month matches
                    const created = new Date((sub as unknown as { createdAt: Date }).createdAt || now);
                    if (nextRenewal.getMonth() === created.getMonth()) {
                        next7DaysCostKurus += sub.priceTRYKurus;
                    }
                }

                // Historical costs
                const created = new Date((sub as unknown as { createdAt: Date }).createdAt || now);
                const monthsSince = Math.max(0,
                    (currentYear - created.getFullYear()) * 12 + (currentMonth - created.getMonth())
                );
                if (sub.renewalFrequency === 'YEARLY') {
                    totalCosts += sub.priceTRYKurus * Math.floor(monthsSince / 12);
                } else {
                    totalCosts += sub.priceTRYKurus * monthsSince;
                }
            }

            const currentBalanceKurus = account.initialBalanceKurus + totalRecharges - totalCosts;

            return {
                id: account.id,
                email: account.email,
                displayName: account.displayName,
                initialBalanceKurus: account.initialBalanceKurus,
                currentBalanceKurus,
                totalRechargesKurus: totalRecharges,
                monthlyCostKurus,
                next7DaysCostKurus,
                subscriptionCount: account._count.subscriptions,
                rechargeCount: account._count.recharges,
                subscriptionNames: account.subscriptions.map(s => s.name),
                createdAt: account.createdAt.toISOString(),
            };
        });

        res.json({ data: result });
    } catch (err) {
        logger.error({ err }, 'Failed to list Apple accounts');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list accounts' } });
    }
});

// POST /api/v1/accounts
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = createAccountSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten().fieldErrors } });
            return;
        }

        const operatorId = req.operator!.operatorId;
        const { email, displayName, initialBalanceKurus } = parsed.data;

        const account = await prisma.appleAccount.create({
            data: { operatorId, email, encryptedPassword: '', displayName, initialBalanceKurus: initialBalanceKurus || 0 },
        });

        logger.info({ operatorId, accountId: account.id }, 'Apple account created');

        res.status(201).json({
            data: {
                id: account.id, email: account.email, displayName: account.displayName,
                initialBalanceKurus: account.initialBalanceKurus,
                currentBalanceKurus: account.initialBalanceKurus,
                totalRechargesKurus: 0, monthlyCostKurus: 0,
                subscriptionCount: 0, rechargeCount: 0, subscriptionNames: [],
                createdAt: account.createdAt.toISOString(),
            }
        });
    } catch (err) {
        logger.error({ err }, 'Failed to create Apple account');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create account' } });
    }
});

// PATCH /api/v1/accounts/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = updateAccountSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten().fieldErrors } });
            return;
        }

        const operatorId = req.operator!.operatorId;
        const accountId = parseInt(req.params.id);

        const existing = await prisma.appleAccount.findFirst({ where: { id: accountId, operatorId } });
        if (!existing) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Apple account not found' } });
            return;
        }

        const updateData: Record<string, unknown> = {};
        if (parsed.data.email) updateData.email = parsed.data.email;
        if (parsed.data.displayName) updateData.displayName = parsed.data.displayName;
        if (parsed.data.initialBalanceKurus !== undefined) updateData.initialBalanceKurus = parsed.data.initialBalanceKurus;

        const updated = await prisma.appleAccount.update({ where: { id: accountId }, data: updateData });

        res.json({
            data: {
                id: updated.id, email: updated.email, displayName: updated.displayName,
                initialBalanceKurus: updated.initialBalanceKurus,
                createdAt: updated.createdAt.toISOString(),
            }
        });
    } catch (err) {
        logger.error({ err }, 'Failed to update Apple account');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update account' } });
    }
});

// POST /api/v1/accounts/:id/recharge
router.post('/:id/recharge', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = rechargeSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
            return;
        }

        const operatorId = req.operator!.operatorId;
        const accountId = parseInt(req.params.id);

        const existing = await prisma.appleAccount.findFirst({ where: { id: accountId, operatorId } });
        if (!existing) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Apple account not found' } });
            return;
        }

        const recharge = await prisma.recharge.create({
            data: { appleAccountId: accountId, operatorId, amountTRYKurus: parsed.data.amountTRYKurus },
        });

        logger.info({ operatorId, accountId, amount: parsed.data.amountTRYKurus }, 'Recharge added');

        res.status(201).json({
            data: { id: recharge.id, amountTRYKurus: recharge.amountTRYKurus, confirmedAt: recharge.confirmedAt.toISOString() }
        });
    } catch (err) {
        logger.error({ err }, 'Failed to add recharge');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add recharge' } });
    }
});

// DELETE /api/v1/accounts/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        const accountId = parseInt(req.params.id);

        const existing = await prisma.appleAccount.findFirst({
            where: { id: accountId, operatorId },
            include: { _count: { select: { subscriptions: true } } },
        });

        if (!existing) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Apple account not found' } });
            return;
        }

        if (existing._count.subscriptions > 0) {
            res.status(409).json({
                error: { code: 'HAS_SUBSCRIPTIONS', message: `Impossible : ${existing._count.subscriptions} abonnement(s) lié(s).` }
            });
            return;
        }

        await prisma.appleAccount.delete({ where: { id: accountId } });
        logger.info({ operatorId, accountId }, 'Apple account deleted');
        res.json({ data: { message: 'Account deleted' } });
    } catch (err) {
        logger.error({ err }, 'Failed to delete Apple account');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete account' } });
    }
});

export default router;
