import { Router, Request, Response } from 'express';
import logger from '../utils/logger.js';
import { fetchRate, getCachedRateInfo } from '../utils/exchangeRate.js';

const router = Router();

// GET /api/v1/exchange-rate — no auth required (public)
router.get('/', async (_req: Request, res: Response): Promise<void> => {
    try {
        const rate = await fetchRate();
        const cachedRate = getCachedRateInfo();
        res.json({
            data: {
                eurToTry: rate,
                tryToEur: 1 / rate,
                source: cachedRate && (Date.now() - cachedRate.fetchedAt) < 5000 ? 'live' : 'cached',
                updatedAt: cachedRate ? new Date(cachedRate.fetchedAt).toISOString() : null,
            }
        });
    } catch (err) {
        logger.error({ err }, 'Exchange rate error');
        res.json({ data: { eurToTry: 38, tryToEur: 1 / 38, source: 'fallback', updatedAt: null } });
    }
});

export default router;
