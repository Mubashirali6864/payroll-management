import 'dotenv/config';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const DEFAULT_DEV_SECRET = 'dev-secret-change-in-production';
const JWT_EXPIRY = '8h';
const BCRYPT_ROUNDS = 12;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!secret || secret.trim() === '') {
      throw new Error('FATAL: JWT_SECRET must be explicitly configured in production.');
    }
    if (secret === DEFAULT_DEV_SECRET || secret.includes('dev-secret')) {
      throw new Error('FATAL: JWT_SECRET cannot be the default development secret in production.');
    }
    if (secret.length < 32) {
      throw new Error('FATAL: JWT_SECRET must be at least 32 characters in production.');
    }
    return secret;
  }

  return secret || DEFAULT_DEV_SECRET;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  permissions: Record<string, Record<string, boolean>>;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || typeof password !== 'string' || !hash || typeof hash !== 'string') {
    return false;
  }
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload;
  } catch {
    return null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const payload = verifyToken(token);
  
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  (req as any).user = payload;
  next();
}

export function requirePermission(module: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JWTPayload | undefined;
    
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (user.role === 'super_admin') {
      next();
      return;
    }

    const modulePerms = user.permissions?.[module];
    if (!modulePerms || !modulePerms[action]) {
      res.status(403).json({ error: `Insufficient permissions: ${module}.${action}` });
      return;
    }

    next();
  };
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JWTPayload | undefined;
    
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient role' });
      return;
    }

    next();
  };
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  
  if (payload) {
    (req as any).user = payload;
  }
  next();
}