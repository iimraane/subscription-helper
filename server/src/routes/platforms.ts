import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { encrypt } from '../utils/encryption.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = Router();
router.use(authMiddleware);

const createPlatformSchema = z.object({
    platform: z.string().min(1, 'Platform name is required'),
    email: z.string().email('Invalid email format'),
    password: z.string().optional(), // Required for SHARHUB, optional for SPLIIIT
    displayName: z.string().min(1, 'Display name is required'),
});

const updatePlatformSchema = z.object({
    platform: z.string().min(1).optional(),
    email: z.string().email('Invalid email format').optional(),
    password: z.string().optional(),
    displayName: z.string().min(1).optional(),
});

// GET /api/v1/platforms
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        const platforms = await prisma.sharingPlatformAccount.findMany({
            where: { operatorId },
            include: { _count: { select: { subscriptions: true, tenants: true } } },
            orderBy: { createdAt: 'desc' },
        });

        const result = platforms.map((p) => ({
            id: p.id, platform: p.platform, email: p.email,
            displayName: p.displayName, hasPassword: p.encryptedPassword !== '',
            subscriptionCount: p._count.subscriptions, tenantCount: p._count.tenants,
            createdAt: p.createdAt.toISOString(),
        }));

        res.json({ data: result });
    } catch (err) {
        logger.error({ err }, 'Failed to list platforms');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list platforms' } });
    }
});

// POST /api/v1/platforms
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = createPlatformSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten().fieldErrors } });
            return;
        }

        const operatorId = req.operator!.operatorId;
        const { platform, email, password, displayName } = parsed.data;

        const account = await prisma.sharingPlatformAccount.create({
            data: {
                operatorId,
                platform: platform.toUpperCase(),
                email,
                encryptedPassword: password ? encrypt(password) : '',
                displayName,
            },
        });

        logger.info({ operatorId, platformId: account.id }, 'Platform account created');
        res.status(201).json({
            data: {
                id: account.id, platform: account.platform, email: account.email,
                displayName: account.displayName, hasPassword: account.encryptedPassword !== '',
                subscriptionCount: 0, tenantCount: 0, createdAt: account.createdAt.toISOString(),
            }
        });
    } catch (err) {
        logger.error({ err }, 'Failed to create platform account');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create platform account' } });
    }
});

// PATCH /api/v1/platforms/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = updatePlatformSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten().fieldErrors } });
            return;
        }

        const operatorId = req.operator!.operatorId;
        const platformId = parseInt(req.params.id);
        const existing = await prisma.sharingPlatformAccount.findFirst({ where: { id: platformId, operatorId } });
        if (!existing) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Platform account not found' } });
            return;
        }

        const updateData: Record<string, string> = {};
        if (parsed.data.platform) updateData.platform = parsed.data.platform.toUpperCase();
        if (parsed.data.email) updateData.email = parsed.data.email;
        if (parsed.data.displayName) updateData.displayName = parsed.data.displayName;
        if (parsed.data.password) updateData.encryptedPassword = encrypt(parsed.data.password);

        const updated = await prisma.sharingPlatformAccount.update({ where: { id: platformId }, data: updateData });
        res.json({
            data: {
                id: updated.id, platform: updated.platform, email: updated.email,
                displayName: updated.displayName, hasPassword: updated.encryptedPassword !== '',
                createdAt: updated.createdAt.toISOString(),
            }
        });
    } catch (err) {
        logger.error({ err }, 'Failed to update platform account');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update platform account' } });
    }
});

// DELETE /api/v1/platforms/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        const platformId = parseInt(req.params.id);
        const existing = await prisma.sharingPlatformAccount.findFirst({
            where: { id: platformId, operatorId },
            include: { _count: { select: { tenants: true } } },
        });
        if (!existing) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Platform account not found' } });
            return;
        }
        if (existing._count.tenants > 0) {
            res.status(409).json({ error: { code: 'HAS_TENANTS', message: `Impossible : ${existing._count.tenants} abonné(s) lié(s).` } });
            return;
        }
        await prisma.sharingPlatformAccount.delete({ where: { id: platformId } });
        logger.info({ operatorId, platformId }, 'Platform account deleted');
        res.json({ data: { message: 'Platform account deleted' } });
    } catch (err) {
        logger.error({ err }, 'Failed to delete platform account');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete platform account' } });
    }
});

export default router;
