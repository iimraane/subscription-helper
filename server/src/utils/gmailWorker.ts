import prisma from './prisma.js';
import logger from './logger.js';
import { triageEmail } from './aiService.js';
import { getAccessTokenForAccount } from '../routes/gmail.js';
import { sendPushToOperator } from './pushService.js';

const AUDIT_DOMAINS = ['spliiit.com', 'sharesub.com'];

/**
 * Scan all Gmail accounts for a specific operator.
 * Fetches new emails from @spliiit.com / @sharesub.com, triages them with GPT-4o-mini,
 * stores results, and sends push notifications for important events.
 */
export async function scanOperatorMailboxes(operatorId: number): Promise<{
    scanned: number; newEvents: number; errors: number;
}> {
    const accounts = await prisma.gmailOAuth.findMany({ where: { operatorId } });
    let scanned = 0, newEvents = 0, errors = 0;

    for (const account of accounts) {
        try {
            const accessToken = await getAccessTokenForAccount(account.id);
            if (!accessToken) {
                logger.warn({ accountId: account.id }, 'Cannot get access token, skipping');
                errors++;
                continue;
            }

            // Build query
            const query = AUDIT_DOMAINS.map(d => `from:@${d}`).join(' OR ');
            const afterDate = account.lastCheckedAt
                ? Math.floor(account.lastCheckedAt.getTime() / 1000)
                : Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000); // Default: last 30 days

            const fullQuery = `(${query}) after:${afterDate}`;

            const listRes = await fetch(
                `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(fullQuery)}&maxResults=20`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (!listRes.ok) {
                logger.error({ status: listRes.status, accountId: account.id }, 'Gmail list failed');
                errors++;
                continue;
            }

            const listData = await listRes.json() as { messages?: { id: string }[] };

            if (!listData.messages || listData.messages.length === 0) {
                await prisma.gmailOAuth.update({
                    where: { id: account.id },
                    data: { lastCheckedAt: new Date() },
                });
                scanned++;
                continue;
            }

            // Process each message
            for (const msg of listData.messages) {
                // Skip if already processed
                const existing = await prisma.gmailAuditLog.findUnique({
                    where: { gmailOAuthId_gmailMessageId: { gmailOAuthId: account.id, gmailMessageId: msg.id } },
                });
                if (existing) continue;

                try {
                    const msgRes = await fetch(
                        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
                        { headers: { Authorization: `Bearer ${accessToken}` } }
                    );
                    if (!msgRes.ok) continue;

                    const msgData = await msgRes.json() as {
                        id: string; snippet: string; internalDate: string;
                        payload: { headers: { name: string; value: string }[] };
                    };

                    const headers = msgData.payload.headers;
                    const from = headers.find(h => h.name === 'From')?.value || '';
                    const subject = headers.find(h => h.name === 'Subject')?.value || '';
                    const domain = AUDIT_DOMAINS.find(d => from.toLowerCase().includes(d)) || 'unknown';
                    const platform = domain === 'spliiit.com' ? 'Spliiit' : domain === 'sharesub.com' ? 'Sharhub' : domain;

                    // AI Triage
                    const triage = await triageEmail({
                        from, subject, snippet: msgData.snippet, platform,
                    });

                    // Store
                    await prisma.gmailAuditLog.create({
                        data: {
                            gmailOAuthId: account.id,
                            operatorId,
                            gmailMessageId: msg.id,
                            from,
                            subject,
                            snippet: msgData.snippet,
                            receivedAt: new Date(parseInt(msgData.internalDate)),
                            domain,
                            platform,
                            eventType: triage.eventType,
                            eventSummary: triage.eventSummary,
                            confidence: triage.confidence,
                            isRead: triage.eventType === 'UNKNOWN', // Silently archive noise
                        },
                    });

                    newEvents++;

                    // Push notification for important events
                    if (['NEW_SUBSCRIBER', 'DEPARTURE', 'PAYMENT'].includes(triage.eventType) && triage.confidence >= 0.7) {
                        const emoji = triage.eventType === 'NEW_SUBSCRIBER' ? '🟢'
                            : triage.eventType === 'DEPARTURE' ? '🔴'
                                : '💰';

                        await sendPushToOperator(operatorId, {
                            title: `${emoji} ${platform} — ${triage.eventType === 'NEW_SUBSCRIBER' ? 'Nouvel abonné' : triage.eventType === 'DEPARTURE' ? 'Départ' : 'Paiement'}`,
                            body: triage.eventSummary,
                            tag: `gmail-${msg.id}`,
                        });
                    }
                } catch (msgErr) {
                    logger.error({ msgErr, msgId: msg.id }, 'Failed to process message');
                    errors++;
                }
            }

            // Update lastCheckedAt
            await prisma.gmailOAuth.update({
                where: { id: account.id },
                data: { lastCheckedAt: new Date() },
            });
            scanned++;
        } catch (accErr) {
            logger.error({ accErr, accountId: account.id }, 'Failed to scan account');
            errors++;
        }
    }

    return { scanned, newEvents, errors };
}

/**
 * Scan ALL operators' mailboxes. Called by cron.
 */
export async function scanAllMailboxes(): Promise<void> {
    logger.info('Gmail worker: starting scan');

    const operators = await prisma.gmailOAuth.findMany({
        select: { operatorId: true },
        distinct: ['operatorId'],
    });

    let totalNew = 0;
    for (const { operatorId } of operators) {
        try {
            const result = await scanOperatorMailboxes(operatorId);
            totalNew += result.newEvents;
        } catch (err) {
            logger.error({ err, operatorId }, 'Worker scan failed for operator');
        }
    }

    logger.info({ totalNew, operatorCount: operators.length }, 'Gmail worker: scan complete');
}
