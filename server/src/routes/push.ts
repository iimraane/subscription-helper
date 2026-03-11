import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { getVapidPublicKey, isPushEnabled } from '../utils/pushService.js';
import logger from '../utils/logger.js';

const router = Router();

// === Public endpoint — returns VAPID public key ===
// No auth required — client needs this before subscribing
router.get('/vapid-key', (_req: Request, res: Response): void => {
    res.json({
        data: {
            publicKey: getVapidPublicKey(),
            enabled: isPushEnabled(),
        }
    });
});

// === Protected endpoints ===
router.use(authMiddleware);

// Validation: standard Web Push subscription shape
const subscriptionSchema = z.object({
    endpoint: z.string().url('Invalid endpoint URL'),
    keys: z.object({
        p256dh: z.string().min(1, 'p256dh key required'),
        auth: z.string().min(1, 'auth key required'),
    }),
});

// POST /api/v1/push/subscribe — Register push subscription
router.post('/subscribe', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!isPushEnabled()) {
            res.status(503).json({ error: { code: 'PUSH_DISABLED', message: 'Push notifications not configured' } });
            return;
        }

        const parsed = subscriptionSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid subscription', details: parsed.error.flatten().fieldErrors } });
            return;
        }

        const operatorId = req.operator!.operatorId;
        const { endpoint, keys } = parsed.data;

        // Security: Check if this endpoint is already registered for this operator
        const existing = await prisma.pushSubscription.findFirst({
            where: { operatorId, endpoint },
        });

        if (existing) {
            // Update keys if they changed (browser may regenerate)
            await prisma.pushSubscription.update({
                where: { id: existing.id },
                data: { p256dh: keys.p256dh, auth: keys.auth },
            });
            logger.info({ operatorId, subId: existing.id }, 'Push subscription updated');
            res.json({ data: { message: 'Subscription updated', id: existing.id } });
            return;
        }

        // Security: Limit subscriptions per operator (prevent abuse)
        const count = await prisma.pushSubscription.count({ where: { operatorId } });
        if (count >= 10) {
            // Remove oldest subscription
            const oldest = await prisma.pushSubscription.findFirst({
                where: { operatorId },
                orderBy: { createdAt: 'asc' },
            });
            if (oldest) {
                await prisma.pushSubscription.delete({ where: { id: oldest.id } });
                logger.info({ operatorId, subId: oldest.id }, 'Removed oldest push subscription (limit reached)');
            }
        }

        const sub = await prisma.pushSubscription.create({
            data: { operatorId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        });

        logger.info({ operatorId, subId: sub.id }, 'Push subscription registered');
        res.status(201).json({ data: { message: 'Subscribed', id: sub.id } });
    } catch (err) {
        logger.error({ err }, 'Failed to register push subscription');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to subscribe' } });
    }
});

// DELETE /api/v1/push/subscribe — Unregister push subscription
router.delete('/subscribe', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        const { endpoint } = req.body as { endpoint: string };

        if (!endpoint) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Endpoint required' } });
            return;
        }

        // Security: Only delete subscriptions belonging to this operator
        const deleted = await prisma.pushSubscription.deleteMany({
            where: { operatorId, endpoint },
        });

        logger.info({ operatorId, count: deleted.count }, 'Push subscription(s) removed');
        res.json({ data: { message: 'Unsubscribed', count: deleted.count } });
    } catch (err) {
        logger.error({ err }, 'Failed to unregister push subscription');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to unsubscribe' } });
    }
});

// POST /api/v1/push/test — Send a test notification to verify push works
router.post('/test', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!isPushEnabled()) {
            res.status(503).json({ error: { code: 'PUSH_DISABLED', message: 'Push notifications not configured' } });
            return;
        }

        const operatorId = req.operator!.operatorId;
        const result = await sendPushToOperator(operatorId, {
            title: '🔔 Test réussi !',
            body: 'Les notifications fonctionnent correctement sur cet appareil.',
            tag: 'push-test',
            url: '/',
        });

        res.json({ data: { message: 'Test envoyé', ...result } });
    } catch (err) {
        logger.error({ err }, 'Push test failed');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur test push' } });
    }
});

export default router;
