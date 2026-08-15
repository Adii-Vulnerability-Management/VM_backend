import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { InjectConnection } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { parseCookies } from './auth/cookies.util';

const OPEN_ROUTE_SUFFIXES = [
  '/apiv1/login',
  '/apiv1/register',
  '/apiv1/token/refresh',
];

/**
 * Lightweight replacement for the full-platform AuthMiddleware. That version
 * pulls in TypeORM's EntityManager, a Redis service, and a GlobalStore
 * service that aren't part of this VM-only backend slice. This version does
 * the same core job — verify the access token and attach the authenticated
 * user to req.user_data — using only what's actually wired up here.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(@InjectConnection() private readonly mongo: mongoose.Connection) {
    this.use = this.use.bind(this);
  }

  private getAccessToken(req: Request): string | null {
    const authHeader = req.headers['authorization'];
    if (authHeader && String(authHeader).startsWith('Bearer ')) {
      return String(authHeader).slice(7).trim();
    }

    const cookies = parseCookies(req);
    return cookies?.access || cookies?.access_token || cookies?.token || null;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const currentUrl = req.originalUrl || req.url;

    if (OPEN_ROUTE_SUFFIXES.some((route) => currentUrl.includes(route))) {
      return next();
    }

    const token = this.getAccessToken(req);
    if (!token) return next();

    try {
      const secret = process.env.JWT_ACCESS_SECRET;
      if (!secret) return next();

      const payload: any = jwt.verify(token, secret);
      const userId = Number(payload?.user_id);
      const email = String(payload?.email || '').toLowerCase().trim();

      let user: any = null;
      if (!Number.isNaN(userId)) {
        user = await this.mongo.collection('users').findOne({ user_id: userId });
      }
      if (!user && email) {
        user = await this.mongo.collection('users').findOne({
          email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        });
      }

      if (user) {
        delete user.password;
        (req as any).user_data = user;
      }
    } catch {
      // invalid/expired token: leave req.user_data unset, guards decide what to do
    }

    return next();
  }
}
