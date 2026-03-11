import logger from './logger.js';

// Cache the rate for 1 hour
let cachedRate: { rate: number; fetchedAt: number } | null = null;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export async function fetchRate(): Promise<number> {
    // Check cache
    if (cachedRate && (Date.now() - cachedRate.fetchedAt) < CACHE_DURATION_MS) {
        return cachedRate.rate;
    }

    try {
        // Try frankfurter (free, no key) with a timeout to prevent hanging the API
        const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=TRY', {
            signal: AbortSignal.timeout(2000)
        });
        if (res.ok) {
            const data = await res.json() as { rates: { TRY: number } };
            const rate = data.rates.TRY;
            cachedRate = { rate, fetchedAt: Date.now() };
            logger.info({ rate }, 'Exchange rate fetched from frankfurter (cached)');
            return rate;
        }
    } catch (err) {
        logger.warn({ err }, 'Failed to fetch rate from frankfurter');
    }

    // Fallback
    const fallback = cachedRate?.rate || 38;
    logger.info({ fallback }, 'Using fallback exchange rate');
    return fallback;
}

export function getCachedRateInfo(): { rate: number; fetchedAt: number } | null {
    return cachedRate;
}
