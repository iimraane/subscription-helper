import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt.js';
import logger from '../utils/logger.js';

// Extend Express Request to include operator
declare global {
    namespace Express {
        interface Request {
            operator?: JwtPayload;
        }
    }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'Access token required' }
        });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = verifyToken(token);
        req.operator = payload;
        next();
    } catch (err) {
        logger.warn('Invalid access token');
        res.status(401).json({
            error: { code: 'TOKEN_EXPIRED', message: 'Access token expired or invalid' }
        });
    }
}
