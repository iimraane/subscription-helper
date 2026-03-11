import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = Router();
router.use(authMiddleware);

const createSubscriptionSchema = z.object({
    name: z.string().min(1, 'Subscription name is required'),
    priceTRYKurus: z.number().int().min(0, 'Price must be positive'),
    revenueEURCents: z.number().int().min(0).default(0),
    renewalDay: z.number().int().min(1).max(31, 'Day must be between 1 and 31'),
    renewalFrequency: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
    appleAccountId: z.number().int().min(1, 'Apple account is required'),
    sharingPlatformAccountId: z.number().int().optional(),
    platformAccountName: z.string().optional(),
});

const updateSubscriptionSchema = z.object({
    name: z.string().min(1).optional(),
    priceTRYKurus: z.number().int().min(0).optional(),
    revenueEURCents: z.number().int().min(0).optional(),
    renewalDay: z.number().int().min(1).max(31).optional(),
    renewalFrequency: z.enum(['MONTHLY', 'YEARLY']).optional(),
    appleAccountId: z.number().int().min(1).optional(),
    sharingPlatformAccountId: z.number().int().nullable().optional(),
    platformAccountName: z.string().nullable().optional(),
});

// GET /api/v1/subscriptions
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;

        const subscriptions = await prisma.subscription.findMany({
            where: { appleAccount: { operatorId } },
            include: {
                appleAccount: { select: { id: true, email: true, displayName: true } },
                sharingPlatformAccount: { select: { id: true, platform: true, displayName: true } },
                _count: { select: { tenants: true } },
            },
            orderBy: { renewalDay: 'asc' },
        });

        const result = subscriptions.map((sub) => ({
            id: sub.id,
            name: sub.name,
            priceTRYKurus: sub.priceTRYKurus,
            revenueEURCents: sub.revenueEURCents,
            renewalDay: sub.renewalDay,
            renewalFrequency: sub.renewalFrequency,
            platformAccountName: sub.platformAccountName,
            appleAccount: sub.appleAccount,
            sharingPlatformAccount: sub.sharingPlatformAccount,
            tenantCount: sub._count.tenants,
            createdAt: sub.createdAt.toISOString(),
        }));

        res.json({ data: result });
    } catch (err) {
        logger.error({ err }, 'Failed to list subscriptions');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list subscriptions' } });
    }
});

// POST /api/v1/subscriptions
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = createSubscriptionSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten().fieldErrors } });
            return;
        }

        const operatorId = req.operator!.operatorId;
        const data = parsed.data;

        const appleAccount = await prisma.appleAccount.findFirst({ where: { id: data.appleAccountId, operatorId } });
        if (!appleAccount) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Apple account not found' } });
            return;
        }

        if (data.sharingPlatformAccountId) {
            const platform = await prisma.sharingPlatformAccount.findFirst({ where: { id: data.sharingPlatformAccountId, operatorId } });
            if (!platform) {
                res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Sharing platform account not found' } });
                return;
            }
        }

        const subscription = await prisma.subscription.create({
            data: {
                name: data.name,
                priceTRYKurus: data.priceTRYKurus,
                revenueEURCents: data.revenueEURCents,
                renewalDay: data.renewalDay,
                renewalFrequency: data.renewalFrequency,
                platformAccountName: data.platformAccountName || null,
                appleAccountId: data.appleAccountId,
                sharingPlatformAccountId: data.sharingPlatformAccountId || null,
            },
            include: {
                appleAccount: { select: { id: true, email: true, displayName: true } },
                sharingPlatformAccount: { select: { id: true, platform: true, displayName: true } },
            },
        });

        logger.info({ operatorId, subscriptionId: subscription.id }, 'Subscription created');

        res.status(201).json({
            data: {
                id: subscription.id,
                name: subscription.name,
                priceTRYKurus: subscription.priceTRYKurus,
                revenueEURCents: subscription.revenueEURCents,
                renewalDay: subscription.renewalDay,
                renewalFrequency: subscription.renewalFrequency,
                platformAccountName: subscription.platformAccountName,
                appleAccount: subscription.appleAccount,
                sharingPlatformAccount: subscription.sharingPlatformAccount,
                tenantCount: 0,
                createdAt: subscription.createdAt.toISOString(),
            }
        });
    } catch (err) {
        logger.error({ err }, 'Failed to create subscription');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create subscription' } });
    }
});

// PATCH /api/v1/subscriptions/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = updateSubscriptionSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten().fieldErrors } });
            return;
        }

        const operatorId = req.operator!.operatorId;
        const subId = parseInt(req.params.id);

        const existing = await prisma.subscription.findFirst({ where: { id: subId, appleAccount: { operatorId } } });
        if (!existing) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
            return;
        }

        if (parsed.data.appleAccountId) {
            const aa = await prisma.appleAccount.findFirst({ where: { id: parsed.data.appleAccountId, operatorId } });
            if (!aa) {
                res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Apple account not found' } });
                return;
            }
        }

        const updated = await prisma.subscription.update({
            where: { id: subId },
            data: parsed.data,
            include: {
                appleAccount: { select: { id: true, email: true, displayName: true } },
                sharingPlatformAccount: { select: { id: true, platform: true, displayName: true } },
            },
        });

        res.json({
            data: {
                id: updated.id,
                name: updated.name,
                priceTRYKurus: updated.priceTRYKurus,
                revenueEURCents: updated.revenueEURCents,
                renewalDay: updated.renewalDay,
                renewalFrequency: updated.renewalFrequency,
                platformAccountName: updated.platformAccountName,
                appleAccount: updated.appleAccount,
                sharingPlatformAccount: updated.sharingPlatformAccount,
                createdAt: updated.createdAt.toISOString(),
            }
        });
    } catch (err) {
        logger.error({ err }, 'Failed to update subscription');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update subscription' } });
    }
});

// DELETE /api/v1/subscriptions/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        const subId = parseInt(req.params.id);

        const existing = await prisma.subscription.findFirst({ where: { id: subId, appleAccount: { operatorId } } });
        if (!existing) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
            return;
        }

        await prisma.subscription.delete({ where: { id: subId } });
        logger.info({ operatorId, subId }, 'Subscription deleted');
        res.json({ data: { message: 'Subscription deleted' } });
    } catch (err) {
        logger.error({ err }, 'Failed to delete subscription');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete subscription' } });
    }
});

export default router;
