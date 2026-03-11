import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = Router();
router.use(authMiddleware);

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'http://localhost:5173/gmail';
const AUDIT_DOMAINS = ['spliiit.com', 'sharesub.com'];

// ========== Helpers ==========

export async function getAccessTokenForAccount(accountId: number): Promise<string | null> {
    const oauth = await prisma.gmailOAuth.findUnique({ where: { id: accountId } });
    if (!oauth) return null;

    if (oauth.accessToken && oauth.tokenExpiresAt && oauth.tokenExpiresAt > new Date()) {
        return oauth.accessToken;
    }

    const refreshToken = decrypt(oauth.encryptedRefreshToken);
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            refresh_token: refreshToken,
            client_id: GMAIL_CLIENT_ID,
            client_secret: GMAIL_CLIENT_SECRET,
            grant_type: 'refresh_token',
        }),
    });

    if (!res.ok) return null;

    const data = await res.json() as { access_token: string; expires_in: number };
    await prisma.gmailOAuth.update({
        where: { id: accountId },
        data: { accessToken: data.access_token, tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000) },
    });

    return data.access_token;
}

// ========== Routes ==========

// GET /status — All Gmail accounts for this operator
router.get('/status', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        const accounts = await prisma.gmailOAuth.findMany({
            where: { operatorId },
            select: { id: true, gmailAddress: true, lastCheckedAt: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            data: {
                configured: !!GMAIL_CLIENT_ID,
                accounts,
                reason: !GMAIL_CLIENT_ID ? 'GMAIL_CLIENT_ID non configuré dans .env' : undefined,
            }
        });
    } catch (err) {
        logger.error({ err }, 'Gmail status failed');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur' } });
    }
});

// GET /auth-url — Generate OAuth URL
router.get('/auth-url', async (_req: Request, res: Response): Promise<void> => {
    if (!GMAIL_CLIENT_ID) {
        res.status(400).json({ error: { code: 'NOT_CONFIGURED', message: 'Gmail OAuth non configuré' } });
        return;
    }

    const scope = 'https://www.googleapis.com/auth/gmail.readonly';
    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(GMAIL_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(GMAIL_REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}` +
        `&access_type=offline` +
        `&prompt=consent`;

    res.json({ data: { url } });
});

// POST /callback — Exchange code for tokens
const callbackSchema = z.object({ code: z.string().min(1) });

router.post('/callback', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = callbackSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Code requis' } });
            return;
        }

        const operatorId = req.operator!.operatorId;

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: parsed.data.code,
                client_id: GMAIL_CLIENT_ID,
                client_secret: GMAIL_CLIENT_SECRET,
                redirect_uri: GMAIL_REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenRes.ok) {
            const errBody = await tokenRes.text();
            logger.error({ errBody }, 'Gmail token exchange failed');
            res.status(400).json({ error: { code: 'TOKEN_EXCHANGE_FAILED', message: "Échec de l'échange de token" } });
            return;
        }

        const tokens = await tokenRes.json() as {
            access_token: string; refresh_token?: string; expires_in: number;
        };

        if (!tokens.refresh_token) {
            res.status(400).json({ error: { code: 'NO_REFRESH_TOKEN', message: 'Pas de refresh token. Révoquez l\'accès et réessayez.' } });
            return;
        }

        // Get Gmail address
        const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!profileRes.ok) {
            const errBody = await profileRes.text();
            logger.error({ status: profileRes.status, response: errBody }, 'Gmail profile fetch failed');
            res.status(400).json({ error: { code: 'PROFILE_FETCH_FAILED', message: "Impossible de récupérer l'adresse Gmail. Réessayez." } });
            return;
        }

        const profile = await profileRes.json() as { emailAddress?: string };

        if (!profile.emailAddress) {
            res.status(400).json({ error: { code: 'NO_EMAIL', message: "Aucune adresse email trouvée. Réessayez." } });
            return;
        }

        // Upsert: one entry per (operatorId, gmailAddress)
        await prisma.gmailOAuth.upsert({
            where: { operatorId_gmailAddress: { operatorId, gmailAddress: profile.emailAddress } },
            create: {
                operatorId,
                gmailAddress: profile.emailAddress,
                encryptedRefreshToken: encrypt(tokens.refresh_token),
                accessToken: tokens.access_token,
                tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            },
            update: {
                encryptedRefreshToken: encrypt(tokens.refresh_token),
                accessToken: tokens.access_token,
                tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            },
        });

        logger.info({ operatorId, gmail: profile.emailAddress }, 'Gmail connected');
        res.json({ data: { gmailAddress: profile.emailAddress, connected: true } });
    } catch (err) {
        logger.error({ err }, 'Gmail callback failed');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur OAuth' } });
    }
});

// DELETE /:id — Disconnect a specific Gmail account
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        const accountId = parseInt(req.params.id);

        const existing = await prisma.gmailOAuth.findFirst({ where: { id: accountId, operatorId } });
        if (!existing) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Compte non trouvé' } });
            return;
        }

        await prisma.gmailOAuth.delete({ where: { id: accountId } });
        logger.info({ operatorId, accountId }, 'Gmail disconnected');
        res.json({ data: { message: 'Gmail déconnecté' } });
    } catch (err) {
        logger.error({ err }, 'Gmail disconnect failed');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur' } });
    }
});

// GET /audit-logs — Get AI-triaged events for this operator
router.get('/audit-logs', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const unreadOnly = req.query.unread === 'true';

        const where: Record<string, unknown> = { operatorId };
        if (unreadOnly) where.isRead = false;

        const logs = await prisma.gmailAuditLog.findMany({
            where,
            orderBy: { receivedAt: 'desc' },
            take: limit,
            include: { gmailOAuth: { select: { gmailAddress: true } } },
        });

        const unreadCount = await prisma.gmailAuditLog.count({ where: { operatorId, isRead: false } });

        res.json({
            data: {
                logs: logs.map(l => ({
                    ...l,
                    gmailAddress: l.gmailOAuth.gmailAddress,
                    gmailOAuthId: l.gmailOAuthId,
                    gmailMessageId: l.gmailMessageId,
                    gmailOAuth: undefined,
                })),
                unreadCount,
            }
        });
    } catch (err) {
        logger.error({ err }, 'Audit logs fetch failed');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur' } });
    }
});

// PATCH /audit-logs/:id/read — Mark as read
router.patch('/audit-logs/:id/read', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        const logId = parseInt(req.params.id);

        await prisma.gmailAuditLog.updateMany({ where: { id: logId, operatorId }, data: { isRead: true } });
        res.json({ data: { message: 'Marqué comme lu' } });
    } catch (err) {
        logger.error({ err }, 'Mark read failed');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur' } });
    }
});

// POST /audit-logs/read-all — Mark all as read
router.post('/audit-logs/read-all', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        await prisma.gmailAuditLog.updateMany({ where: { operatorId, isRead: false }, data: { isRead: true } });
        res.json({ data: { message: 'Tout marqué comme lu' } });
    } catch (err) {
        logger.error({ err }, 'Mark all read failed');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur' } });
    }
});

// POST /scan — Manual scan trigger for all operator's accounts
router.post('/scan', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;

        // Import and run worker for this operator only
        const { scanOperatorMailboxes } = await import('../utils/gmailWorker.js');
        const results = await scanOperatorMailboxes(operatorId);

        res.json({ data: results });
    } catch (err) {
        logger.error({ err }, 'Manual scan failed');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur scan' } });
    }
});

// GET /message/:accountId/:messageId — Fetch full email content from Gmail
router.get('/message/:accountId/:messageId', async (req: Request, res: Response): Promise<void> => {
    try {
        const operatorId = req.operator!.operatorId;
        const accountId = parseInt(req.params.accountId);
        const messageId = req.params.messageId;

        // Verify ownership
        const account = await prisma.gmailOAuth.findFirst({ where: { id: accountId, operatorId } });
        if (!account) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Compte non trouvé' } });
            return;
        }

        const { getAccessTokenForAccount } = await import('../routes/gmail.js');
        const accessToken = await getAccessTokenForAccount(accountId);
        if (!accessToken) {
            res.status(401).json({ error: { code: 'TOKEN_ERROR', message: 'Impossible de récupérer le token' } });
            return;
        }

        // Fetch full message
        const msgRes = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgRes.ok) {
            res.status(msgRes.status).json({ error: { code: 'GMAIL_ERROR', message: 'Erreur récupération du message' } });
            return;
        }

        const msgData = await msgRes.json() as {
            id: string; snippet: string;
            payload: {
                headers: { name: string; value: string }[];
                body?: { data?: string };
                parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: Array<{ mimeType: string; body?: { data?: string } }> }>;
            };
        };

        // Extract headers
        const headers = msgData.payload.headers;
        const from = headers.find(h => h.name === 'From')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        // Extract body — decode base64url
        const decodeBase64Url = (data: string): string => {
            const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
            try { return decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')); }
            catch { return atob(base64); }
        };

        let htmlBody = '';
        let textBody = '';

        const extractParts = (parts: typeof msgData.payload.parts) => {
            if (!parts) return;
            for (const part of parts) {
                if (part.mimeType === 'text/html' && part.body?.data) {
                    htmlBody = decodeBase64Url(part.body.data);
                } else if (part.mimeType === 'text/plain' && part.body?.data) {
                    textBody = decodeBase64Url(part.body.data);
                } else if (part.parts) {
                    extractParts(part.parts);
                }
            }
        };

        if (msgData.payload.parts) {
            extractParts(msgData.payload.parts);
        } else if (msgData.payload.body?.data) {
            htmlBody = decodeBase64Url(msgData.payload.body.data);
        }

        res.json({
            data: {
                id: msgData.id,
                from, subject, date,
                htmlBody,
                textBody: textBody || msgData.snippet,
            }
        });
    } catch (err) {
        logger.error({ err }, 'Fetch full message failed');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur' } });
    }
});

export default router;
