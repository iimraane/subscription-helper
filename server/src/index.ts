import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import subscriptionRoutes from './routes/subscriptions.js';
import exchangeRateRoutes from './routes/exchangeRate.js';
import platformRoutes from './routes/platforms.js';
import cockpitRoutes from './routes/cockpit.js';
import pushRoutes from './routes/push.js';
import financeRoutes from './routes/finance.js';
import gmailRoutes from './routes/gmail.js';
import { startNotificationScheduler } from './utils/notificationScheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// === Middleware ===
app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
}));

app.use(rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' }
    },
}));

app.use(express.json());
app.use(cookieParser());

// === API Routes ===
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/accounts', accountRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/exchange-rate', exchangeRateRoutes);
app.use('/api/v1/platforms', platformRoutes);
app.use('/api/v1/cockpit', cockpitRoutes);
app.use('/api/v1/push', pushRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/gmail', gmailRoutes);

// === Health Check ===
app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// === Serve React SPA in production ===
if (process.env.NODE_ENV === 'production') {
    const clientDistPath = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDistPath));
    app.get('*', (_req, res) => {
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}

// === Error Handler ===
app.use(errorHandler);

// === Start Server ===
app.listen(PORT, () => {
    logger.info({ port: PORT }, `🚀 Subscription Helper server running on port ${PORT}`);
    startNotificationScheduler();
});

export default app;
