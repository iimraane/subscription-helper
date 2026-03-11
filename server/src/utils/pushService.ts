import webpush from 'web-push';
import prisma from './prisma.js';
import logger from './logger.js';

// === VAPID Configuration ===
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = process.env.VAPID_CONTACT || 'mailto:admin@localhost';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn('VAPID keys not configured — push notifications disabled');
} else {
    webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    logger.info('Web Push configured with VAPID');
}

export function getVapidPublicKey(): string {
    return VAPID_PUBLIC_KEY || '';
}

export function isPushEnabled(): boolean {
    return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

/**
 * Send a push notification to all devices of an operator.
 * Payload is sanitized — no sensitive data (passwords, tokens) is included.
 */
export async function sendPushToOperator(
    operatorId: number,
    payload: { title: string; body: string; tag?: string; url?: string }
): Promise<{ sent: number; failed: number }> {
    if (!isPushEnabled()) {
        logger.warn('Push disabled, skipping notification');
        return { sent: 0, failed: 0 };
    }

    const subscriptions = await prisma.pushSubscription.findMany({
        where: { operatorId },
    });

    if (subscriptions.length === 0) {
        logger.info({ operatorId }, 'No push subscriptions found');
        return { sent: 0, failed: 0 };
    }

    // Sanitize payload — never include sensitive data
    const safePayload = JSON.stringify({
        title: payload.title.substring(0, 100),
        body: payload.body.substring(0, 250),
        tag: payload.tag || 'subscription-helper',
        url: payload.url || '/',
        timestamp: Date.now(),
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification(
                {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                safePayload,
                {
                    TTL: 86400, // 24 hours
                    urgency: 'high',
                    topic: payload.tag || 'default',
                }
            );
            sent++;
        } catch (err: unknown) {
            const statusCode = (err as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
                // Subscription expired or unsubscribed — clean up
                await prisma.pushSubscription.delete({ where: { id: sub.id } });
                logger.info({ subId: sub.id }, 'Removed expired push subscription');
            } else {
                logger.error({ err, subId: sub.id }, 'Failed to send push notification');
            }
            failed++;
        }
    }

    logger.info({ operatorId, sent, failed }, 'Push notifications sent');
    return { sent, failed };
}
