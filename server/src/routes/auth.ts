import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { generateAccessToken, generateRefreshToken, verifyToken, JwtPayload } from '../utils/jwt.js';
import logger from '../utils/logger.js';

const router = Router();

// Validation schemas
const registerSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
});

// POST /api/v1/auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
    try {
        // Validate input
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid input',
                    details: parsed.error.flatten().fieldErrors,
                }
            });
            return;
        }

        const { email, password } = parsed.data;

        // Check for duplicate email
        const existing = await prisma.operator.findUnique({ where: { email } });
        if (existing) {
            res.status(409).json({
                error: { code: 'EMAIL_EXISTS', message: 'This email is already registered.' }
            });
            return;
        }

        // Hash password with bcrypt (salt rounds = 12)
        const passwordHash = await bcrypt.hash(password, 12);

        // Check if first operator → auto-admin
        const operatorCount = await prisma.operator.count();
        const role = operatorCount === 0 ? 'ADMIN' : 'OPERATOR';

        // Create operator
        const operator = await prisma.operator.create({
            data: { email, passwordHash, role },
        });

        // Generate tokens
        const payload: JwtPayload = {
            operatorId: operator.id,
            email: operator.email,
            role: operator.role,
        };
        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken(payload);

        // Set refresh token as httpOnly cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        logger.info({ operatorId: operator.id, role }, 'New operator registered');

        res.status(201).json({
            data: {
                accessToken,
                operator: {
                    id: operator.id,
                    email: operator.email,
                    role: operator.role,
                    createdAt: operator.createdAt.toISOString(),
                },
            }
        });
    } catch (err) {
        logger.error({ err }, 'Registration failed');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Registration failed' }
        });
    }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid input',
                    details: parsed.error.flatten().fieldErrors,
                }
            });
            return;
        }

        const { email, password } = parsed.data;

        // Find operator
        const operator = await prisma.operator.findUnique({ where: { email } });
        if (!operator) {
            res.status(401).json({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
            });
            return;
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, operator.passwordHash);
        if (!validPassword) {
            res.status(401).json({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
            });
            return;
        }

        // Generate tokens
        const payload: JwtPayload = {
            operatorId: operator.id,
            email: operator.email,
            role: operator.role,
        };
        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken(payload);

        // Set refresh token as httpOnly cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        logger.info({ operatorId: operator.id }, 'Operator logged in');

        res.json({
            data: {
                accessToken,
                operator: {
                    id: operator.id,
                    email: operator.email,
                    role: operator.role,
                    createdAt: operator.createdAt.toISOString(),
                },
            }
        });
    } catch (err) {
        logger.error({ err }, 'Login failed');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Login failed' }
        });
    }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.cookies?.refreshToken;
        if (!token) {
            res.status(401).json({
                error: { code: 'NO_REFRESH_TOKEN', message: 'Refresh token required' }
            });
            return;
        }

        const payload = verifyToken(token);

        // Verify operator still exists
        const operator = await prisma.operator.findUnique({
            where: { id: payload.operatorId },
        });

        if (!operator) {
            res.status(401).json({
                error: { code: 'OPERATOR_NOT_FOUND', message: 'Operator no longer exists' }
            });
            return;
        }

        // Generate new tokens
        const newPayload: JwtPayload = {
            operatorId: operator.id,
            email: operator.email,
            role: operator.role,
        };
        const accessToken = generateAccessToken(newPayload);
        const refreshToken = generateRefreshToken(newPayload);

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        res.json({
            data: {
                accessToken, operator: {
                    id: operator.id,
                    email: operator.email,
                    role: operator.role,
                    createdAt: operator.createdAt.toISOString(),
                }
            }
        });
    } catch (err) {
        res.status(401).json({
            error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token expired or invalid' }
        });
    }
});

// POST /api/v1/auth/logout
router.post('/logout', (_req: Request, res: Response): void => {
    res.clearCookie('refreshToken');
    res.json({ data: { message: 'Logged out successfully' } });
});

export default router;
