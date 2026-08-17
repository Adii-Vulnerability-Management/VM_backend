// ✅ FILE: backend/src/auth/auth.service.ts

import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import crypto from 'crypto';
import * as speakeasy from 'speakeasy';

console.error('AUTH SERVICE FILE LOADED');

let QRCodeLib: any = null;
try {
  // optional dependency: npm install qrcode
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  QRCodeLib = require('qrcode');
  console.error('QRCODE PACKAGE LOADED');
} catch (err) {
  console.error(
    'QRCODE PACKAGE NOT INSTALLED - continuing without qr_code field',
  );
}

import { verifyDjangoPBKDF2 } from './django-password.util';
import {
  parseCookies,
  setDjangoAuthCookies,
  setDjangoAccessOnlyCookies,
  clearAllCookiesLikeDjango,
} from './cookies.util';

import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { RbacService } from 'src/access/rbac.service';

type MongoUser = Record<string, any>;

@Injectable()
export class AuthService {
  constructor(
    @InjectConnection() private readonly mongo: mongoose.Connection,
    private readonly rbac: RbacService,
  ) {
    console.error('AuthService constructor called');
  }

  async getUsersFromDb(req: Request, query: any) {
    const authUser = await this.requireUserFromAccess(req);
    if (!authUser) {
      return {
        statusCode: 401,
        body: { detail: 'Authentication credentials were not provided.' },
      };
    }

    const page = Math.max(parseInt(query?.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(query?.limit, 100) || 100, 1),
      100,
    );
    const skip = (page - 1) * limit;

    const search = query?.search ? String(query.search).trim() : '';
    const role = query?.role ? String(query.role).trim() : '';
    const module = query?.module ? String(query.module).trim() : '';

    const includeDeleted = String(query?.includeDeleted || 'false') === 'true';

    const filter: any = {};
    const tenantFilter = this.actorTenantFilter(authUser);
    if (tenantFilter) filter.$and = [tenantFilter];

    if (!includeDeleted) {
      filter.is_deleted = { $ne: true };
    }

    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { user_email: { $regex: search, $options: 'i' } },
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { user_name: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      filter.roles = { $in: [role] };
    }

    if (module) {
      filter.modules = { $in: [module] };
    }

    const projection = {
      password: 0,
      __v: 0,
    };

    const users = await this.mongo
      .collection('users')
      .find(filter, { projection })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await this.mongo.collection('users').countDocuments(filter);

    return {
      statusCode: 200,
      body: {
        total,
        page,
        limit,
        data: users,
      },
    };
  }

  private normalizeEmail(email: any) {
    return email ? String(email).trim().toLowerCase() : '';
  }

  private escapeRegexExact(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private resolveEmailFromUser(user: MongoUser): string {
    const e = user?.email || user?.user_email || '';
    return this.normalizeEmail(e);
  }

  private normalizeRoleKey(name: any): string {
    return String(name || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  private normalizeUserRoles(user: MongoUser): MongoUser {
    if (!user) return user;
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const normalized = roles
      .map((r: any) => this.normalizeRoleKey(r))
      .filter(Boolean);
    return { ...user, roles: normalized };
  }

  private isPlatformSuperUser(user: MongoUser): boolean {
    return (
      user?.is_superuser === true &&
      user?.is_staff === true &&
      user?.is_active !== false
    );
  }

  private actorTenantFilter(user: MongoUser): any | null {
    if (this.isPlatformSuperUser(user)) return null;
    const tenantId = String(user?.tenant_id ?? user?.tenantId ?? '').trim();
    if (!tenantId) return null;
    return {
      $or: [{ tenant_id: tenantId }, { tenantId }],
    };
  }

  private isFullAccessUser(user: MongoUser): boolean {
    if (!user) return false;

    if (user?.is_staff && user?.is_superuser) return true;

    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const rolesNorm = roles.map((r: any) => this.normalizeRoleKey(r));

    return rolesNorm.includes('SUPER_ADMIN');
  }

  private canManageTempPassword(user: MongoUser): boolean {
    if (!user) return false;

    if (user?.is_staff && user?.is_superuser) return true;

    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const normalizedRoles = roles
      .map((r: any) => this.normalizeRoleKey(r))
      .filter(Boolean);

    return (
      normalizedRoles.includes('SUPER_ADMIN') ||
      normalizedRoles.includes('ADMIN') ||
      normalizedRoles.includes('EMPLOYEE')
    );
  }

  private async attachRbacToUser(user: MongoUser): Promise<MongoUser> {
    if (!user) return user;

    const userNorm = this.normalizeUserRoles(user);

    if (this.isFullAccessUser(userNorm)) {
      return { ...userNorm, permissionKeys: ['*'], modules: ['*'] };
    }

    let permissionKeys: string[] = [];
    try {
      if (typeof (this.rbac as any).resolvePermissionsForUser === 'function') {
        permissionKeys = await (this.rbac as any).resolvePermissionsForUser(
          userNorm,
        );
      }
    } catch (err) {
      console.error('ATTACH RBAC permission error:', err);
      permissionKeys = Array.isArray(userNorm?.permissionKeys)
        ? userNorm.permissionKeys
        : [];
    }

    let modules: string[] = [];
    try {
      if (typeof (this.rbac as any).resolveModulesForUser === 'function') {
        // modules = await (this.rbac as any).resolveModulesForUser(userNorm);
        modules = user.modules;
      }
    } catch (err) {
      console.error('ATTACH RBAC module error:', err);
      modules = Array.isArray(userNorm?.modules) ? userNorm.modules : [];
    }

    return {
      ...userNorm,
      permissionKeys,
      modules,
    };
  }

  private async buildUserDataWithRbac(user: MongoUser, _userType: string) {
    const userWithRbac = await this.attachRbacToUser(user);
    // console.log('User Data with userWithRbac:', userWithRbac, user); // <-- Add this log

    const userData = this.sanitizeUserForClient({ ...userWithRbac });

    if (userWithRbac?.permissionKeys) {
      (userData as any).permissionKeys = userWithRbac.permissionKeys;
    }

    if (userWithRbac?.roles) {
      (userData as any).roles = userWithRbac.roles;
    }

    // console.log('User Data with RBAC:', userData); // <-- Add this log

    // if (userWithRbac?.modules) {
    //   (userData as any).modules = userWithRbac.modules;
    // }
    // if (userWithRbac?.modules) {
    //   (userData as any).modules = userWithRbac.modules.map((module) => ({
    //     ...module, // Preserve the entire module object
    //     subModules: Array.isArray(module.subModules) ? module.subModules : [], // Ensure subModules is always an array
    //   }));
    // }
    if (userWithRbac?.modules) {
      (userData as any).modules = userWithRbac.modules.map((module) => ({
        moduleKey:
          typeof module.moduleKey === 'string'
            ? module.moduleKey // If it's already a string, keep it
            : Object.values(module).slice(0, 7).join(''), // Rebuild moduleKey from individual characters
        permissions: Array.isArray(module.permissions)
          ? module.permissions // Ensure permissions is always an array
          : [],
        subModules: Array.isArray(module.subModules)
          ? module.subModules // Ensure subModules is always an array
          : [], // Empty array if subModules is not an array
      }));
    }
    if (userWithRbac?.modules) {
      (userData as any).modules = userWithRbac.modules.map((module) => ({
        moduleKey:
          typeof module.moduleKey === 'string'
            ? module.moduleKey // If it's already a string, keep it
            : Object.values(module).slice(0, 7).join(''), // Rebuild moduleKey from individual characters
        permissions: Array.isArray(module.permissions)
          ? module.permissions // Ensure permissions is always an array
          : [],
        subModules: Array.isArray(module.subModules)
          ? module.subModules // Ensure subModules is always an array
          : [],
      }));
    }

    // console.log('User Data after subModules mapping:', userData); // <-- Add this log

    return userData;
  }

  private extractErrMsg(body: any): string {
    if (!body) return 'Authentication failed';
    if (typeof body === 'string') return body;

    if (typeof body.detail === 'string') return body.detail;
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;

    try {
      return JSON.stringify(body);
    } catch {
      return 'Authentication failed';
    }
  }

  private async findUserFromJwtPayload(payload: any) {
    const email = this.normalizeEmail(payload?.email || '');
    const userId =
      typeof payload?.user_id === 'number'
        ? payload.user_id
        : Number(payload?.user_id) || null;

    // console.log('[AUTH_SERVICE][FIND_USER_FROM_PAYLOAD_START]', {
    //   userId,
    //   email,
    // });

    let user: MongoUser | null = null;

    if (userId !== null && !Number.isNaN(userId)) {
      user = await this.mongo.collection('users').findOne({
        user_id: userId,
      });

      // console.log('[AUTH_SERVICE][FIND_USER_FROM_PAYLOAD_BY_ID]', {
      //   userId,
      //   found: !!user,
      //   dbEmail: user?.email || user?.user_email || null,
      //   dbUserId: user?.user_id || null,
      // });

      if (user) return user;
    }

    if (email) {
      user = await this.mongo.collection('users').findOne({
        $or: [
          {
            email: {
              $regex: new RegExp(`^${this.escapeRegexExact(email)}$`, 'i'),
            },
          },
          {
            user_email: {
              $regex: new RegExp(`^${this.escapeRegexExact(email)}$`, 'i'),
            },
          },
        ],
      });

      // console.log('[AUTH_SERVICE][FIND_USER_FROM_PAYLOAD_BY_EMAIL]', {
      //   email,
      //   found: !!user,
      //   dbEmail: user?.email || user?.user_email || null,
      //   dbUserId: user?.user_id || null,
      // });

      if (user) return user;
    }

    return null;
  }

  async loginCheck(req: Request) {
    const result = await this.checkAuthenticated(req);
    if (result.statusCode !== 200)
      throw new Error(this.extractErrMsg(result.body));
    return result.body;
  }

  async refresh(
    req: Request,
    res: Response,
  ): Promise<{ message: string; access_token: string }> {
    const result = await this.refreshAccessLikeDjango(req, res);

    if (result.statusCode !== 200) {
      throw new Error(this.extractErrMsg(result.body));
    }

    return result.body as { message: string; access_token: string };
  }

  private get accessSecret() {
    const v = process.env.JWT_ACCESS_SECRET;
    if (!v) throw new Error('JWT_ACCESS_SECRET missing');
    return v;
  }

  private get refreshSecret() {
    const v = process.env.JWT_REFRESH_SECRET;
    if (!v) throw new Error('JWT_REFRESH_SECRET missing');
    return v;
  }

  private sha256(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private getUserTypeLikeDjango(user: MongoUser): string {
    if (user?.is_staff && user?.is_superuser) return 'super_user';
    return 'Employee';
  }

  /** Accepts tenant_id or tenantId on request body; optional DEFAULT_TENANT_ID env for single-tenant installs. */
  private pickTenantIdFromBody(body: any): string | undefined {
    const raw = body?.tenant_id ?? body?.tenantId;
    if (raw == null || raw === '') return undefined;
    const s = String(raw).trim();
    return s || undefined;
  }

  private resolveTenantIdForNewUser(body: any): string | undefined {
    const fromBody = this.pickTenantIdFromBody(body);
    if (fromBody) return fromBody;
    const env = process.env.DEFAULT_TENANT_ID?.trim();
    if (env) return env;
    return undefined;
  }

  private sanitizeUserForClient(u: MongoUser) {
    const user = { ...u };
    delete user._id;
    delete user.__v;
    delete user.createdAt;
    delete user.updatedAt;
    delete user.password;

    delete user.user_designation;

    user.email = this.resolveEmailFromUser(user);
    user.id = user.user_id;

    if (user.profile_img_path && !user.profile_img) {
      user.profile_img = `https://grcbucket.s3.amazonaws.com/${user.profile_img_path}`;
    }

    return user;
  }

  private signAccess(user: MongoUser, sessionid: string) {
    const email = this.resolveEmailFromUser(user);
    const tenantRaw = user?.tenant_id ?? user?.tenantId;
    const tenant_id =
      tenantRaw != null && String(tenantRaw).trim()
        ? String(tenantRaw).trim()
        : undefined;
    const claims: Record<string, any> = {
      type: 'access',
      email,
      user_id: user.user_id,
      sessionid,
    };
    if (tenant_id) claims.tenant_id = tenant_id;
    return jwt.sign(claims, this.accessSecret, { expiresIn: '2h' });
  }

  private signRefresh(user: MongoUser, sessionid: string) {
    const email = this.resolveEmailFromUser(user);
    const tenantRaw = user?.tenant_id ?? user?.tenantId;
    const tenant_id =
      tenantRaw != null && String(tenantRaw).trim()
        ? String(tenantRaw).trim()
        : undefined;
    const jti = crypto.randomBytes(16).toString('hex');
    const claims: Record<string, any> = {
      type: 'refresh',
      email,
      user_id: user.user_id,
      jti,
      sessionid,
    };
    if (tenant_id) claims.tenant_id = tenant_id;
    const token = jwt.sign(claims, this.refreshSecret, { expiresIn: '7d' });
    return { token, jti };
  }

  private makeSessionId() {
    return crypto.randomBytes(24).toString('hex');
  }

  private async storeRefreshToken(
    user_id: number,
    jti: string,
    refreshToken: string,
  ) {
    await this.mongo.collection('refresh_tokens').insertOne({
      user_id,
      jti,
      tokenHash: this.sha256(refreshToken),
      revokedAt: null,
      createdAt: new Date(),
    });
  }

  private async revokeRefreshToken(jti: string) {
    await this.mongo
      .collection('refresh_tokens')
      .updateOne({ jti }, { $set: { revokedAt: new Date() } });
  }

  private async isRefreshRevoked(jti: string, refreshToken: string) {
    const rec = await this.mongo.collection('refresh_tokens').findOne({ jti });
    if (!rec) return true;
    if (rec.revokedAt) return true;
    if (rec.tokenHash !== this.sha256(refreshToken)) return true;
    return false;
  }

  private getAccessFromReq(req: Request) {
    const auth = req.headers['authorization'];
    if (auth && String(auth).startsWith('Bearer ')) {
      return String(auth).slice(7);
    }

    const cookies = parseCookies(req);

    if (cookies?.access) return cookies.access;
    if (cookies?.access_token) return cookies.access_token;
    if (cookies?.token) return cookies.token;

    return null;
  }

  private getRefreshFromReq(req: Request) {
    const cookies = parseCookies(req);
    const refresh = cookies?.refresh;
    if (refresh) return refresh;

    const hdr = req.headers['x-refresh-token'];
    if (hdr) return String(hdr);

    return null;
  }

  private async ensureUserFrameworksLikeDjango(user: MongoUser) {
    const resolvedEmail = this.resolveEmailFromUser(user);
    const query = {
      $or: [
        { user_id: user.user_id },
        { email: resolvedEmail },
        { user_email: resolvedEmail },
      ],
    };

    const existing = await this.mongo
      .collection('userframeworks')
      .findOne(query);
    if (existing) return;

    const mongoUser = await this.mongo
      .collection('users')
      .findOne({ user_id: user.user_id });
    if (!mongoUser) return;

    await this.mongo.collection('userframeworks').insertOne({
      user: mongoUser._id,
      createdAt: new Date(),
      user_id: user.user_id,
      email: resolvedEmail,
      user_email: resolvedEmail,
      is_deleted: false,
    });
  }

  private async requireUserFromAccess(req: Request) {
    const accessToken = this.getAccessFromReq(req);

    // console.log('[AUTH_SERVICE][REQUIRE_USER_START]', {
    //   method: req.method,
    //   url: req.originalUrl || req.url,
    //   hasAccessToken: !!accessToken,
    //   accessTokenPreview: accessToken
    //     ? `${String(accessToken).slice(0, 8)}...${String(accessToken).slice(
    //         -8,
    //       )}`
    //     : null,
    //   authHeaderPresent: !!req.headers['authorization'],
    //   cookiePresent: !!req.headers['cookie'],
    // });

    if (!accessToken) {
      // console.log('[AUTH_SERVICE][REQUIRE_USER_NO_TOKEN]');
      return null;
    }

    try {
      const payload: any = jwt.verify(accessToken, this.accessSecret);

      // console.log('[AUTH_SERVICE][REQUIRE_USER_JWT_OK]', {
      //   email: payload?.email || null,
      //   user_id: payload?.user_id || null,
      //   type: payload?.type || null,
      //   sessionid: payload?.sessionid || null,
      // });

      const user = await this.findUserFromJwtPayload(payload);

      // console.log('[AUTH_SERVICE][REQUIRE_USER_DB_RESULT]', {
      //   lookupEmail: this.normalizeEmail(payload?.email || ''),
      //   lookupUserId: payload?.user_id ?? null,
      //   found: !!user,
      //   dbEmail: user?.email || user?.user_email || null,
      //   user_id: user?.user_id || null,
      // });

      return user || null;
    } catch (err: any) {
      // console.log('[AUTH_SERVICE][REQUIRE_USER_JWT_FAIL]', {
      //   message: err?.message || 'jwt verify failed',
      //   name: err?.name || null,
      //   accessSecretPresent: !!process.env.JWT_ACCESS_SECRET,
      //   accessSecretLength: process.env.JWT_ACCESS_SECRET?.length || 0,
      // });
      return null;
    }
  }

  private async updateLoginTracking(user: MongoUser) {
    try {
      const resolvedEmail = this.resolveEmailFromUser(user);
      const now = new Date();

      await this.mongo.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            last_login: now,
            lastLoginAt: now,
            lastUpdatedAt: now,
            updatedAt: now,
          },
        },
      );

      if (typeof (this.rbac as any)?.recordUserLogin === 'function') {
        await (this.rbac as any).recordUserLogin({
          email: resolvedEmail,
          user_id: user?.user_id,
          loginAt: now,
        });
      }

      // console.log('LOGIN TRACKING UPDATED', {
      //   user_id: user?.user_id,
      //   email: resolvedEmail,
      //   loginAt: now.toISOString(),
      // });
    } catch (err) {
      console.error('LOGIN TRACKING ERROR:', err);
    }
  }

  async checkAuthenticated(req: Request) {
    const accessToken = this.getAccessFromReq(req);

    // console.log('TOKEN DEBUG', {
    //   tokenSource: req.headers['authorization'] ? 'header' : 'cookie',
    //   token: accessToken?.slice(0, 20),
    // });
    // console.log('[AUTH_SERVICE][CHECK_AUTH_START]', {
    //   method: req.method,
    //   url: req.originalUrl || req.url,
    //   hasAccessToken: !!accessToken,
    //   accessTokenPreview: accessToken
    //     ? `${String(accessToken).slice(0, 8)}...${String(accessToken).slice(
    //         -8,
    //       )}`
    //     : null,
    //   authHeaderPresent: !!req.headers['authorization'],
    //   cookiePresent: !!req.headers['cookie'],
    // });

    if (!accessToken) {
      // console.log('[AUTH_SERVICE][CHECK_AUTH_NO_TOKEN]');
      return {
        statusCode: 401,
        body: { detail: 'Authentication credentials were not provided.' },
      };
    }

    let payload: any;
    try {
      payload = jwt.verify(accessToken, this.accessSecret);

      // console.log('[AUTH_SERVICE][CHECK_AUTH_JWT_OK]', {
      //   email: payload?.email || null,
      //   user_id: payload?.user_id || null,
      //   type: payload?.type || null,
      //   sessionid: payload?.sessionid || null,
      // });
    } catch (err: any) {
      // console.log('[AUTH_SERVICE][CHECK_AUTH_JWT_FAIL]', {
      //   message: err?.message || 'jwt verify failed',
      //   name: err?.name || null,
      // });

      return {
        statusCode: 401,
        body: { detail: 'Given token not valid for any token type' },
      };
    }

    const user = await this.findUserFromJwtPayload(payload);
    // console.log('[AUTH_SERVICE][CHECK_AUTH_DB_USER]', {
    //   lookupEmail: email,
    //   found: !!user,
    //   dbEmail: user?.email || user?.user_email || null,
    //   user_id: user?.user_id || null,
    //   roles: user?.roles || [],
    // });

    if (!user) {
      return { statusCode: 401, body: { detail: 'User not found' } };
    }

    const userType = this.getUserTypeLikeDjango(user);
    const userData = await this.buildUserDataWithRbac(user, userType);

    // console.log('[AUTH_SERVICE][CHECK_AUTH_SUCCESS]', {
    //   userType,
    //   hasUserData: !!userData,
    //   userDataKeys: userData ? Object.keys(userData) : [],
    //   email: userData?.email || userData?.user_email || null,
    //   user_id: userData?.id || userData?.user_id || null,
    //   roles: userData?.roles || [],
    // });

    return {
      statusCode: 200,
      body: {
        message: "You're authenticated!",
        user_type: userType,
        user_data: userData,
      },
    };
  }

  async loginLikeDjango(
    req: Request,
    res: Response,
    emailRaw: any,
    passwordRaw: any,
  ) {
    try {
      const emailIn = emailRaw ? String(emailRaw).trim() : '';
      const password = passwordRaw ? String(passwordRaw).trim() : '';

      if (!emailIn) return { statusCode: 400, body: 'Please Submit Email ID' };
      if (!password) return { statusCode: 400, body: 'Please Submit Password' };

      const emailNorm = this.normalizeEmail(emailIn);
      const escaped = this.escapeRegexExact(emailNorm);

      console.log('LOGIN START', { email: emailNorm });

      let user: MongoUser | null = null;
      try {
        user = await this.mongo.collection('users').findOne({
          $or: [
            { email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
            { user_email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
          ],
        });
      } catch (err) {
        console.error('LOGIN USER LOOKUP ERROR:', err);
        return { statusCode: 500, body: 'User lookup failed' };
      }

      if (!user) return { statusCode: 404, body: "User Doesn't Exists." };

      if (!user.password || typeof user.password !== 'string') {
        // console.log('LOGIN DEBUG: user has no usable password', {
        //   email: this.resolveEmailFromUser(user),
        //   user_id: user.user_id,
        //   roles: user.roles,
        //   passwordType: typeof user.password,
        // });
        return { statusCode: 400, body: 'Invalid Credentials' };
      }

      const storedHash: string = user.password;

      // console.log('LOGIN DEBUG:', {
      //   email: emailNorm,
      //   user_id: user.user_id,
      //   roles: user.roles,
      //   isPasswordChanged: user.isPasswordChanged,
      //   hashType: storedHash.startsWith('pbkdf2_sha256$')
      //     ? 'django_pbkdf2'
      //     : 'bcrypt',
      // });

      let ok = false;

      if (storedHash.startsWith('pbkdf2_sha256$')) {
        try {
          ok = verifyDjangoPBKDF2(password, storedHash);
        } catch (err) {
          console.error('DJANGO HASH VERIFY ERROR:', err);
          return { statusCode: 400, body: 'Invalid Credentials' };
        }

        if (
          ok &&
          /^true$/i.test(process.env.UPGRADE_DJANGO_HASH_TO_BCRYPT || 'true')
        ) {
          try {
            const bcryptHash = await bcrypt.hash(password, 12);
            await this.mongo
              .collection('users')
              .updateOne(
                { user_id: user.user_id },
                { $set: { password: bcryptHash } },
              );
          } catch (err) {
            console.error('HASH UPGRADE ERROR:', err);
          }
        }
      } else {
        try {
          ok = await bcrypt.compare(password, storedHash);
        } catch (e) {
          console.error('BCRYPT COMPARE ERROR:', e);
          return { statusCode: 400, body: 'Invalid Credentials' };
        }
      }

      if (!ok) return { statusCode: 400, body: 'Invalid Credentials' };

      console.log('LOGIN STEP: password verified');

      try {
        await this.ensureUserFrameworksLikeDjango(user);
        console.log('LOGIN STEP: userframework ensured');
      } catch (err) {
        console.error('LOGIN STEP ERROR: ensureUserFrameworksLikeDjango', err);
      }

      try {
        await this.updateLoginTracking(user);
        console.log('LOGIN STEP: login tracking updated');
      } catch (err) {
        console.error('LOGIN STEP ERROR: updateLoginTracking', err);
      }

      const refreshedUser =
        (await this.mongo.collection('users').findOne({ _id: user._id })) ||
        user;

      const force_password_change = refreshedUser.isPasswordChanged === false;

      if (refreshedUser.mfaEnabled) {
        try {
          await this.mongo
            .collection('users')
            .updateOne(
              { user_id: refreshedUser.user_id },
              { $set: { afterLoginMfaVerified: false } },
            );
          refreshedUser.afterLoginMfaVerified = false;
        } catch (err) {
          console.error('LOGIN MFA FLAG UPDATE ERROR:', err);
        }
      }

      const userType = this.getUserTypeLikeDjango(refreshedUser);
      const sessionid = this.makeSessionId();

      let access_token = '';
      let refresh_token = '';
      let jti = '';

      try {
        access_token = this.signAccess(refreshedUser, sessionid);
        console.log('LOGIN STEP: access token created');

        const refreshRes = this.signRefresh(refreshedUser, sessionid);
        refresh_token = refreshRes.token;
        jti = refreshRes.jti;
        console.log('LOGIN STEP: refresh token created');
      } catch (err) {
        console.error('TOKEN CREATION ERROR:', err);
        return { statusCode: 500, body: 'Token generation failed' };
      }

      try {
        await this.storeRefreshToken(refreshedUser.user_id, jti, refresh_token);
        console.log('LOGIN STEP: refresh token stored');
      } catch (err) {
        console.error('LOGIN STEP ERROR: storeRefreshToken', err);
      }

      let userData: any = null;
      try {
        userData = await this.buildUserDataWithRbac(refreshedUser, userType);
        // console.log('User Data after login:', userData); // <-- Add this log
      } catch (err) {
        console.error('LOGIN STEP ERROR: buildUserDataWithRbac', err);
        userData = this.sanitizeUserForClient({ ...refreshedUser });
        userData.permissionKeys = Array.isArray(refreshedUser?.permissionKeys)
          ? refreshedUser.permissionKeys
          : [];
        userData.roles = Array.isArray(refreshedUser?.roles)
          ? refreshedUser.roles
          : [];
        // userData.modules = Array.isArray(refreshedUser?.modules)
        //   ? refreshedUser.modules
        //   : [];
        // userData.modules = Array.isArray(refreshedUser?.modules)
        //   ? refreshedUser.modules.map((module) => ({
        //       ...module, // Preserve the entire module object
        //       subModules: Array.isArray(module.subModules)
        //         ? module.subModules
        //         : [], // Ensure subModules is always an array
        //     }))
        //   : [];
        //       userData.modules = Array.isArray(refreshedUser?.modules)
        // ? refreshedUser.modules.map((module) => ({
        //     moduleKey: typeof module.moduleKey === 'string'
        //       ? module.moduleKey  // If it's already a string, keep it
        //       : Object.values(module).slice(0, 7).join(''),  // Rebuild moduleKey from individual characters
        //     permissions: Array.isArray(module.permissions)
        //       ? module.permissions  // Ensure permissions is always an array
        //       : [],
        //     subModules: Array.isArray(module.subModules)
        //       ? module.subModules  // Ensure subModules is always an array
        //       : [],
        //   }))
        // : [];
        userData.modules = Array.isArray(refreshedUser?.modules)
          ? refreshedUser.modules.map((module) => ({
              moduleKey:
                typeof module.moduleKey === 'string'
                  ? module.moduleKey
                  : Object.values(module).slice(0, 7).join(''), // Rebuild moduleKey from individual characters if necessary
              permissions: Array.isArray(module.permissions)
                ? module.permissions
                : [], // Default to an empty array if permissions is not an array
              subModules: Array.isArray(module.subModules)
                ? module.subModules // Ensure subModules is an array
                : [], // Default to an empty array if subModules is not an array
            }))
          : [];
        // console.log(`OKkkkk${userData}`);
      }
      // console.log('Final user data to send:', userData); // <-- Add this log
      try {
        setDjangoAuthCookies(res, {
          accessToken: access_token,
          refreshToken: refresh_token,
          userData,
        });
        console.log('LOGIN STEP: auth cookies set');
      } catch (err) {
        console.error('LOGIN STEP ERROR: setDjangoAuthCookies', err);
      }

      console.log('LOGIN SUCCESS', {
        email: emailNorm,
        user_id: refreshedUser?.user_id,
      });

      return {
        statusCode: 200,
        body: {
          message: 'You have Logged-in Successfully',
          user_type: userType,
          user_data: userData,
          access_token,
          refresh_token,
          sessionid,
          force_password_change,
        },
      };
    } catch (err) {
      console.error('LOGIN FATAL ERROR:', err);
      return { statusCode: 500, body: 'Internal Server Error' };
    }
  }

  async refreshAccessLikeDjango(req: Request, res: Response) {
    const refreshToken = this.getRefreshFromReq(req);
    if (!refreshToken)
      return { statusCode: 400, body: 'Please Submit refresh token' };

    let payload: any;
    try {
      payload = jwt.verify(refreshToken, this.refreshSecret);
    } catch {
      return { statusCode: 401, body: 'Invalid Refresh Token' };
    }

    if (payload?.type !== 'refresh' || !payload?.jti) {
      return { statusCode: 401, body: 'Invalid Refresh Token' };
    }

    const revoked = await this.isRefreshRevoked(payload.jti, refreshToken);
    if (revoked) return { statusCode: 401, body: 'Invalid Refresh Token' };

    const email = this.normalizeEmail(payload.email || '');
    const user = await this.mongo.collection('users').findOne({
      $or: [{ email }, { user_email: email }],
    });
    if (!user) return { statusCode: 401, body: 'Unauthorized' };

    const userType = this.getUserTypeLikeDjango(user);
    const userData = await this.buildUserDataWithRbac(user, userType);

    const sessionid = payload.sessionid || this.makeSessionId();
    const access_token = this.signAccess(user, sessionid);

    setDjangoAccessOnlyCookies(res, { accessToken: access_token, userData });

    return {
      statusCode: 200,
      body: { message: 'Access Token Refreshed Successfully.', access_token },
    };
  }

  async logoutLikeDjango(req: Request, res: Response) {
    const accessToken = this.getAccessFromReq(req);
    if (!accessToken)
      return { statusCode: 400, body: 'Please Submit access token' };

    const refreshToken = this.getRefreshFromReq(req);
    if (!refreshToken)
      return { statusCode: 400, body: 'Please Submit refresh token' };

    try {
      const payload: any = jwt.verify(refreshToken, this.refreshSecret);
      if (payload?.jti) await this.revokeRefreshToken(payload.jti);
    } catch {}

    clearAllCookiesLikeDjango(req, res);
    return { statusCode: 200, body: 'You have Logged-out Successfully' };
  }

  private async getNextUserId() {
    const last = await this.mongo
      .collection('users')
      .find({})
      .sort({ user_id: -1 })
      .limit(1)
      .toArray();

    const lastId = last?.[0]?.user_id;
    if (typeof lastId === 'number') return lastId + 1;
    return 1;
  }

  async registerLikeDjango(req: Request, res: Response, body: any) {
    const email = this.normalizeEmail(body?.email);
    const password = body?.password ? String(body.password) : '';
    const user_name = body?.user_name ? String(body.user_name).trim() : '';
    const contact_number = body?.contact_number
      ? String(body.contact_number).trim()
      : '';

    const first_name = body?.first_name ? String(body.first_name).trim() : null;
    const last_name = body?.last_name ? String(body.last_name).trim() : null;
    const address = body?.address ? String(body.address).trim() : null;
    const employeeId = body?.employeeId ? String(body.employeeId).trim() : null;

    if (!email) return { statusCode: 400, body: 'Please Submit Email ID' };
    if (!password) return { statusCode: 400, body: 'Please Submit Password' };
    if (!user_name) return { statusCode: 400, body: 'Please Submit User Name' };
    if (!contact_number)
      return { statusCode: 400, body: 'Please Submit Contact Number' };

    const escaped = this.escapeRegexExact(email);

    const exists = await this.mongo.collection('users').findOne({
      $or: [
        { email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        { user_email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      ],
    });
    if (exists) return { statusCode: 400, body: 'User Already Exists.' };

    const user_id = await this.getNextUserId();
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    const defaultRoles: string[] = body?.roles?.length
      ? body.roles
      : ['Employee'];

    // ✅ _id and user_uuid are same
    const objectId = new mongoose.Types.ObjectId();
    const user_uuid = objectId.toString();

    const userDoc: any = {
      _id: objectId,
      user_uuid,
      user_id,
      email,
      user_email: email,
      password: passwordHash,
      user_name,
      contact_number,
      first_name,
      last_name,
      address,
      employeeId,
      is_active: true,
      is_staff: false,
      is_superuser: false,
      is_deleted: false,
      date_joined: now,
      last_login: null,
      lastLoginAt: null,
      lastUpdatedAt: now,
      lastUpdatedBy: null,
      isPasswordChanged: false,
      emailVerified: false,
      mfaEnabled: false,
      afterLoginMfaVerified: null,
      resources: [],
      roles: defaultRoles,
      permissionKeys: [],
      modules: [],
      createdAt: now,
      updatedAt: now,
    };

    const tenant_id = this.resolveTenantIdForNewUser(body);
    if (tenant_id) userDoc.tenant_id = tenant_id;

    await this.mongo.collection('users').insertOne(userDoc);
    await this.ensureUserFrameworksLikeDjango(userDoc);

    const perms = await this.attachRbacToUser(userDoc);

    await this.mongo.collection('users').updateOne(
      { user_id },
      {
        $set: {
          roles: (perms.roles || defaultRoles).map((r: any) =>
            this.normalizeRoleKey(r),
          ),
          permissionKeys: perms.permissionKeys || [],
          modules: perms.modules || [],
          updatedAt: new Date(),
          lastUpdatedAt: new Date(),
        },
      },
    );

    const dbUser =
      (await this.mongo.collection('users').findOne({ user_id })) || userDoc;

    const userType = this.getUserTypeLikeDjango(dbUser);
    const sessionid = this.makeSessionId();

    const access_token = this.signAccess(dbUser, sessionid);
    const { token: refresh_token, jti } = this.signRefresh(dbUser, sessionid);
    await this.storeRefreshToken(user_id, jti, refresh_token);

    const userData = await this.buildUserDataWithRbac(dbUser, userType);

    setDjangoAuthCookies(res, {
      accessToken: access_token,
      refreshToken: refresh_token,
      userData,
    });

    return {
      statusCode: 201,
      body: {
        message: 'User Registered Successfully',
        user_type: userType,
        user_data: userData,
        access_token,
        refresh_token,
        sessionid,
      },
    };
  }

  async getAllUsers(req: Request, query: any) {
    const user = await this.requireUserFromAccess(req);
    if (!user) {
      return {
        statusCode: 401,
        body: { detail: 'Authentication credentials were not provided.' },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 100;
    const skip = (page - 1) * limit;

    const search = query.search ? String(query.search).trim() : '';
    const role = query.role ? String(query.role).trim() : '';

    const filter: any = {};
    const tenantFilter = this.actorTenantFilter(user);
    if (tenantFilter) filter.$and = [tenantFilter];

    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { user_email: { $regex: search, $options: 'i' } },
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { user_name: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      filter.roles = { $in: [role] };
    }

    const users = await this.mongo
      .collection('users')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await this.mongo.collection('users').countDocuments(filter);

    const formatted = users.map((u: any) => {
      const resolvedEmail = this.normalizeEmail(u.email || u.user_email || '');
      const rolesNorm = Array.isArray(u.roles)
        ? u.roles.map((r: any) => this.normalizeRoleKey(r))
        : [];

      return {
        id: u.user_id,
        name:
          u.first_name && u.last_name
            ? `${u.first_name} ${u.last_name}`
            : u.user_name || '',
        email: resolvedEmail,
        role:
          u.is_staff && u.is_superuser
            ? 'Super Admin'
            : Array.isArray(rolesNorm) && rolesNorm.length
              ? rolesNorm.join(', ')
              : 'Pending Access',
        modules: u.modules || [],
        mfa: u.mfaEnabled ? 'Enabled' : 'Disabled',
        active: u.is_active ? 'Yes' : 'No',
        deleted: u.is_deleted ? 'Yes' : 'No',
        phone: u.contact_number || '-',
        employeeId: u.employeeId || '-',
        joined: u.createdAt || null,
        lastLogin: u.lastLoginAt || u.last_login || null,
        roles: rolesNorm,
        lastUpdatedAt: u.lastUpdatedAt || u.updatedAt || null,
        lastUpdatedBy: u.lastUpdatedBy || null,
        tenant_id: u.tenant_id ?? u.tenantId ?? null,
      };
    });

    return {
      statusCode: 200,
      body: {
        total,
        page,
        limit,
        data: formatted,
      },
    };
  }

  private get sesClient() {
    const region = process.env.AWS_SES_REGION || process.env.AWS_REGION;
    const accessKeyId =
      process.env.AWS_SES_ACCESS_KEY_ID ||
      process.env.SES_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env.AWS_SES_SECRET_ACCESS_KEY ||
      process.env.SES_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken =
      process.env.AWS_SES_SESSION_TOKEN ||
      process.env.AWS_SESSION_TOKEN ||
      process.env.AWS_SECURITY_TOKEN;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS SES env missing (AWS_REGION/AWS_SES_REGION, AWS_ACCESS_KEY_ID/AWS_SES_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY/AWS_SES_SECRET_ACCESS_KEY)',
      );
    }

    return new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    });
  }

  private async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ) {
    const from = process.env.AWS_SES_FROM_EMAIL;

    if (!from) {
      console.log('[AWS SES not configured] Missing AWS_SES_FROM_EMAIL');
      console.log('[EMAIL CONTENT]', { to, subject, text });
      return;
    }

    const cmd = new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: text, Charset: 'UTF-8' },
          ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
        },
      },
    });

    await this.sesClient.send(cmd);
  }

  private generateOtp() {
    const len = Number(process.env.OTP_LENGTH || 6);
    const min = 10 ** (len - 1);
    const max = 10 ** len - 1;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
  }

  async sendEmailOtpLikeDjango(req: Request) {
    const user = await this.requireUserFromAccess(req);

    console.error('EMAIL OTP REQUEST', {
      user_id: user?.user_id,
      email: user?.email || user?.user_email || null,
    });

    if (!user) {
      console.error('EMAIL OTP ERROR: user not authenticated');
      return {
        statusCode: 401,
        body: { detail: 'Authentication credentials were not provided.' },
      };
    }

    const email = this.resolveEmailFromUser(user);

    let device: any = await this.mongo
      .collection('email_devices')
      .findOne({ email });

    if (!device) {
      device = await this.mongo
        .collection('email_devices')
        .findOne({ user_email: email });
    }

    if (!device) {
      const insertRes = await this.mongo.collection('email_devices').insertOne({
        email,
        user_email: email,
        confirmed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      device = { _id: insertRes.insertedId, email, confirmed: false };
    }

    const otp = this.generateOtp();
    const expMin = Number(process.env.OTP_EXP_MINUTES || 10);
    const expiresAt = new Date(Date.now() + expMin * 60_000);

    console.error('==============================');
    console.error('EMAIL OTP GENERATED');
    console.error('user_id:', user.user_id);
    console.error('email:', email);
    console.error('otp:', otp);
    console.error('expiresAt:', expiresAt.toISOString());
    console.error('==============================');

    await this.mongo.collection('email_otps').insertOne({
      email,
      otpHash: this.sha256(otp),
      expiresAt,
      usedAt: null,
      createdAt: new Date(),
    });

    const subject = `${process.env.APP_NAME || 'GRC3'} OTP Verification`;
    const text = `Hello ${user.user_name || user.first_name || ''},
  
  Your verification OTP is: ${otp}
  
  This OTP will expire in ${expMin} minutes.
  `;

    await this.sendMail(email, subject, text);

    return {
      statusCode: 200,
      body: {
        message: device.confirmed
          ? 'OTP email sent successfully.'
          : 'Please verify email id. OTP email sent successfully.',
      },
    };
  }

  async verifyEmailOtpLikeDjango(req: Request, otpRaw: any) {
    const user = await this.requireUserFromAccess(req);

    console.error('EMAIL OTP VERIFY REQUEST', {
      user_id: user?.user_id,
      email: user?.email || user?.user_email || null,
      enteredOtp: otpRaw ? String(otpRaw).trim() : '',
    });

    if (!user) {
      console.error('EMAIL OTP VERIFY ERROR: user not authenticated');
      return {
        statusCode: 401,
        body: { detail: 'Authentication credentials were not provided.' },
      };
    }

    const otp = otpRaw ? String(otpRaw).trim() : '';
    if (!otp) {
      console.error('EMAIL OTP VERIFY ERROR: empty otp');
      return { statusCode: 400, body: { error: 'Invalid OTP.' } };
    }

    const email = this.resolveEmailFromUser(user);
    const now = new Date();

    const doc = await this.mongo.collection('email_otps').findOne({
      email,
      usedAt: null,
      expiresAt: { $gt: now },
      otpHash: this.sha256(otp),
    });

    console.error('EMAIL OTP VERIFY RESULT', {
      email,
      enteredOtp: otp,
      matched: !!doc,
    });

    if (!doc) return { statusCode: 400, body: { error: 'Invalid OTP.' } };

    await this.mongo
      .collection('email_otps')
      .updateOne({ _id: doc._id }, { $set: { usedAt: new Date() } });

    await this.mongo
      .collection('email_devices')
      .updateOne(
        { email },
        { $set: { confirmed: true, updatedAt: new Date() } },
        { upsert: true },
      );

    const update: any = { emailVerified: true };
    if (user.mfaEnabled === true) update.afterLoginMfaVerified = true;

    await this.mongo
      .collection('users')
      .updateOne({ user_id: user.user_id }, { $set: update });

    console.error('EMAIL OTP VERIFIED SUCCESS', {
      user_id: user.user_id,
      email,
      verifiedOtp: otp,
    });

    return { statusCode: 200, body: { message: 'OTP verified successfully.' } };
  }

  private filterTOTPUrlLikeDjango(url: string) {
    try {
      const [base, query] = url.split('?', 2);
      if (!query) return url;

      const unwanted = new Set(['algorithm', 'digits', 'period']);
      const filtered = query
        .split('&')
        .filter((p) => !unwanted.has(p.split('=')[0]))
        .join('&');

      return filtered ? `${base}?${filtered}` : base;
    } catch {
      return url;
    }
  }

  private async buildTotpSetupPayload(secretDoc: any, email: string) {
    const totp_url = this.filterTOTPUrlLikeDjango(secretDoc?.otpauth_url || '');

    let qr_code: string | null = null;
    if (totp_url && QRCodeLib?.toDataURL) {
      try {
        qr_code = await QRCodeLib.toDataURL(totp_url);
      } catch (err) {
        console.error('TOTP QR GENERATION ERROR:', err);
      }
    }

    return {
      totp_url,
      qr_code,
      manual_entry_key: secretDoc?.base32 || null,
      account_name: email,
      issuer: process.env.APP_NAME || 'GRC3',
    };
  }

  async totpCreateLikeDjango(req: Request) {
    const user = await this.requireUserFromAccess(req);

    console.error('TOTP CREATE REQUEST', {
      user_id: user?.user_id,
      email: user?.email || user?.user_email || null,
    });

    if (!user) {
      console.error('TOTP CREATE ERROR: user not authenticated');
      return {
        statusCode: 401,
        body: { detail: 'Authentication credentials were not provided.' },
      };
    }

    if (!user.emailVerified) {
      console.error('TOTP CREATE ERROR: email not verified', {
        user_id: user.user_id,
        email: this.resolveEmailFromUser(user),
      });
      return {
        statusCode: 403,
        body: { error: 'User not found or email id not verified.' },
      };
    }

    const email = this.resolveEmailFromUser(user);

    const secretDoc: any = await this.mongo
      .collection('totp_secrets')
      .findOne({ email });

    if (!secretDoc) {
      const app = process.env.APP_NAME || 'GRC3';
      const secret = speakeasy.generateSecret({
        name: `${app}:${email}`,
        length: 20,
      });

      console.error('==============================');
      console.error('TOTP SECRET GENERATED');
      console.error('user_id:', user.user_id);
      console.error('email:', email);
      console.error('base32:', secret.base32);
      console.error('otpauth_url:', secret.otpauth_url);
      console.error('==============================');

      await this.mongo.collection('totp_secrets').insertOne({
        email,
        base32: secret.base32,
        otpauth_url: secret.otpauth_url,
        confirmed: false,
        tolerance: 2,
        createdAt: new Date(),
      });

      const payload = await this.buildTotpSetupPayload(
        {
          base32: secret.base32,
          otpauth_url: secret.otpauth_url,
        },
        email,
      );

      return { statusCode: 201, body: payload };
    }

    console.error('TOTP SECRET ALREADY EXISTS', {
      user_id: user.user_id,
      email,
      base32: secretDoc?.base32 || null,
      otpauth_url: secretDoc?.otpauth_url || null,
    });

    const payload = await this.buildTotpSetupPayload(secretDoc, email);
    return { statusCode: 200, body: payload };
  }

  async totpVerifyLikeDjango(req: Request, totpRaw: any) {
    const user = await this.requireUserFromAccess(req);

    console.error('TOTP VERIFY REQUEST', {
      user_id: user?.user_id,
      email: user?.email || user?.user_email || null,
      enteredTotp: totpRaw ? String(totpRaw).trim() : '',
    });

    if (!user) {
      console.error('TOTP VERIFY ERROR: user not authenticated');
      return {
        statusCode: 401,
        body: { detail: 'Authentication credentials were not provided.' },
      };
    }

    const totp_token = totpRaw ? String(totpRaw).trim() : '';
    if (!totp_token) {
      console.error('TOTP VERIFY ERROR: empty token');
      return { statusCode: 400, body: { error: 'Invalid OTP.' } };
    }

    const email = this.resolveEmailFromUser(user);

    const secretDoc: any = await this.mongo
      .collection('totp_secrets')
      .findOne({ email });

    console.error('TOTP VERIFY SECRET LOOKUP', {
      email,
      found: !!secretDoc,
      base32: secretDoc?.base32 || null,
    });

    if (!secretDoc?.base32)
      return { statusCode: 400, body: { error: 'Invalid OTP.' } };

    const ok = speakeasy.totp.verify({
      secret: secretDoc.base32,
      encoding: 'base32',
      token: totp_token,
      window: 2,
    });

    console.error('==============================');
    console.error('TOTP VERIFY RESULT');
    console.error('user_id:', user.user_id);
    console.error('email:', email);
    console.error('enteredTotp:', totp_token);
    console.error('base32:', secretDoc.base32);
    console.error('verified:', ok);
    console.error('==============================');

    if (!ok) return { statusCode: 400, body: { error: 'Invalid OTP.' } };

    await this.mongo
      .collection('totp_secrets')
      .updateOne(
        { email },
        { $set: { confirmed: true, confirmedAt: new Date() } },
      );

    await this.mongo
      .collection('users')
      .updateOne(
        { user_id: user.user_id },
        { $set: { mfaEnabled: true, afterLoginMfaVerified: true } },
      );

    console.error('TOTP VERIFIED SUCCESS', {
      user_id: user.user_id,
      email,
      verifiedTotp: totp_token,
    });

    return { statusCode: 200, body: { message: 'OTP verified successfully.' } };
  }

  async disableMfaLikeDjango(req: Request) {
    const user = await this.requireUserFromAccess(req);

    console.error('DISABLE MFA REQUEST', {
      user_id: user?.user_id,
      email: user?.email || user?.user_email || null,
    });

    if (!user) {
      console.error('DISABLE MFA ERROR: user not authenticated');
      return {
        statusCode: 401,
        body: { detail: 'Authentication credentials were not provided.' },
      };
    }

    await this.mongo
      .collection('users')
      .updateOne(
        { user_id: user.user_id },
        { $set: { mfaEnabled: false, afterLoginMfaVerified: null } },
      );

    console.error('MFA DISABLED SUCCESS', {
      user_id: user.user_id,
      email: this.resolveEmailFromUser(user),
    });

    return { statusCode: 200, body: { message: 'Mfa Disabled successfully.' } };
  }

  private generateRandomPassword(length = 12) {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < length; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  }

  async createUserAndEmailPasswordLikeDjango(body: any, req?: Request) {
    console.error('HIT createUserAndEmailPasswordLikeDjango');

    const first_name = body?.first_name ? String(body.first_name).trim() : '';
    const last_name = body?.last_name ? String(body.last_name).trim() : '';
    const employeeId = body?.employeeId ? String(body.employeeId).trim() : '';
    const email = this.normalizeEmail(body?.email);
    const contact_number = body?.contact_number
      ? String(body.contact_number).trim()
      : '';

    if (!first_name)
      return { statusCode: 400, body: 'Please Submit First Name' };
    if (!last_name) return { statusCode: 400, body: 'Please Submit Last Name' };
    if (!employeeId)
      return { statusCode: 400, body: 'Please Submit Employee ID' };
    if (!email) return { statusCode: 400, body: 'Please Submit Email ID' };
    if (!contact_number)
      return { statusCode: 400, body: 'Please Submit Contact Number' };

    const escaped = this.escapeRegexExact(email);

    const exists = await this.mongo.collection('users').findOne({
      $or: [
        { email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        { user_email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      ],
    });

    if (exists) return { statusCode: 400, body: 'User Already Exists.' };

    // const currentUserCount = await this.mongo
    //   .collection('users')
    //   .countDocuments({ is_deleted: { $ne: true } });

    // if (currentUserCount >= 13) {
    //   throw new HttpException('User limit exceeded', HttpStatus.FORBIDDEN);
    // }

    const user_id = await this.getNextUserId();
    const now = new Date();

    const passwordLength = Number(process.env.NEW_USER_PASSWORD_LENGTH || 12);
    const tempPassword = this.generateRandomPassword(passwordLength);

    console.error('==============================');
    console.error('TEMP PASSWORD GENERATED (CREATE USER)');
    console.error('email:', email);
    console.error('tempPassword:', tempPassword);
    console.error('==============================');

    const tempHash = await bcrypt.hash(tempPassword, 12);

    const objectId = new mongoose.Types.ObjectId();
    const user_uuid = objectId.toString();
    const actor = req ? await this.requireUserFromAccess(req) : null;
    const actorTenant = actor ? this.actorTenantFilter(actor) : null;
    if (actorTenant && !this.pickTenantIdFromBody(body)) {
      body.tenant_id = actor?.tenant_id ?? actor?.tenantId;
    }

    const userDoc: any = {
      _id: objectId,
      user_uuid,
      user_id,
      email,
      user_email: email,
      password: tempHash,
      tempPassword,
      user_name: `${first_name} ${last_name}`.trim(),
      first_name,
      last_name,
      employeeId,
      contact_number,
      is_active: true,
      is_staff: false,
      is_superuser: false,
      is_deleted: false,
      date_joined: now,
      last_login: null,
      lastLoginAt: null,
      lastUpdatedAt: now,
      lastUpdatedBy: null,
      resources: [],
      roles: [],
      permissionKeys: [],
      modules: [],
      credentialsSentAt: null,
      rolesAssignedAt: null,
      isPasswordChanged: false,
      emailVerified: false,
      mfaEnabled: false,
      afterLoginMfaVerified: null,
      createdAt: now,
      updatedAt: now,
    };

    const tenant_id = this.resolveTenantIdForNewUser(body);
    if (tenant_id) userDoc.tenant_id = tenant_id;

    // Log user creation attempt
    console.log('User creation initiated for:', email);

    try {
      await this.mongo.collection('users').insertOne(userDoc);
      console.log('User document inserted into MongoDB');
    } catch (err) {
      console.error('Error inserting user document into MongoDB:', err);
      return { statusCode: 500, body: 'Error creating user' };
    }

    // Log framework setup
    try {
      await this.ensureUserFrameworksLikeDjango(userDoc);
      console.log('User frameworks ensured');
    } catch (err) {
      console.error('Error ensuring user frameworks:', err);
    }

    // Send the email immediately after creating the user
    const appName = process.env.APP_NAME || 'GRC3';
    const displayName = `${first_name} ${last_name}`.trim() || 'User';

    const subject = `${appName} Temporary Password`;
    const text = `Hello ${displayName},
  
  Your account has been created successfully.
  
  Login Email: ${email}
  Temporary Password: ${tempPassword}
  
  Please log in and change your password after first login.
  
  Thanks,
  ${appName}
  `;

    try {
      await this.sendMail(email, subject, text);
      console.log('Temporary password email sent successfully.');

      await this.mongo.collection('users').updateOne(
        { _id: userDoc._id },
        {
          $set: {
            credentialsSentAt: new Date(),
            updatedAt: new Date(),
            lastUpdatedAt: new Date(),
          },
        },
      );
      console.log('credentialsSentAt updated for user:', email);
    } catch (err) {
      console.error('Error sending email or updating credentialsSentAt:', err);

      return {
        statusCode: 201,
        body: {
          message:
            'User created successfully, but failed to send temp password email.',
          user_id,
          email,
          tempPassword,
        },
      };
    }

    return {
      statusCode: 201,
      body: {
        message: 'User created successfully and temp password email sent.',
        user_id,
        email,
      },
    };
  }

  async updateUserTempPassword(req: Request, body: any) {
    console.error('HIT updateUserTempPassword');

    const authUser = await this.requireUserFromAccess(req);
    if (!authUser) {
      return {
        statusCode: 401,
        body: { detail: 'Authentication credentials were not provided.' },
      };
    }

    if (!this.canManageTempPassword(authUser)) {
      return {
        statusCode: 403,
        body: { detail: 'You do not have permission to update temp password.' },
      };
    }

    const email = body?.email ? this.normalizeEmail(body.email) : '';
    const user_id =
      body?.user_id !== undefined && body?.user_id !== null
        ? Number(body.user_id)
        : null;

    const providedTempPassword = body?.tempPassword
      ? String(body.tempPassword).trim()
      : '';

    const sendEmail = body?.sendEmail === true;

    if (!email && !user_id) {
      return {
        statusCode: 400,
        body: 'Please provide email or user_id',
      };
    }

    const query =
      typeof user_id === 'number' && !Number.isNaN(user_id)
        ? { user_id }
        : { $or: [{ email }, { user_email: email }] };

    const dbUser = await this.mongo.collection('users').findOne(query);
    if (!dbUser) {
      return {
        statusCode: 404,
        body: 'User not found',
      };
    }

    const passwordLength = Number(process.env.NEW_USER_PASSWORD_LENGTH || 12);
    const tempPassword =
      providedTempPassword || this.generateRandomPassword(passwordLength);

    console.error('==============================');
    console.error('TEMP PASSWORD GENERATED (UPDATE USER)');
    console.error('user_id:', dbUser.user_id);
    console.error('email:', this.resolveEmailFromUser(dbUser));
    console.error('tempPassword:', tempPassword);
    console.error('==============================');

    const tempHash = await bcrypt.hash(tempPassword, 12);
    const targetEmail = this.resolveEmailFromUser(dbUser);

    await this.mongo.collection('users').updateOne(
      { _id: dbUser._id },
      {
        $set: {
          password: tempHash,
          tempPassword,
          isPasswordChanged: true,
          credentialsSentAt: sendEmail ? new Date() : null,
          updatedAt: new Date(),
          lastUpdatedAt: new Date(),
          lastUpdatedBy: this.resolveEmailFromUser(authUser),
        },
      },
    );

    if (sendEmail && targetEmail) {
      const appName = process.env.APP_NAME || 'GRC3';
      const displayName =
        String(dbUser?.user_name || dbUser?.first_name || '').trim() || 'User';

      const subject = `${appName} Temporary Password Updated`;
      const text = `Hello ${displayName},

Your temporary password has been updated.

Login Email: ${targetEmail}
Temporary Password: ${tempPassword}

Please log in and change your password after first login.

Thanks,
${appName}
`;

      await this.sendMail(targetEmail, subject, text);
    }

    return {
      statusCode: 200,
      body: {
        message: 'Temporary password updated successfully.',
        emailSent: !!(sendEmail && targetEmail),
        user_id: dbUser.user_id,
        email: targetEmail,
        tempPassword,
      },
    };
  }
  async requestPasswordResetLikeDjango(req: Request, emailRaw: any) {
    try {
      const email = this.normalizeEmail(emailRaw);

      if (!email) {
        return {
          statusCode: 400,
          body: { message: 'Email is required' },
        };
      }

      const escaped = this.escapeRegexExact(email);

      const user = await this.mongo.collection('users').findOne({
        $or: [
          { email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
          { user_email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        ],
        is_deleted: { $ne: true },
      });

      // Do not reveal whether user exists
      if (!user) {
        return {
          statusCode: 200,
          body: {
            message: 'If this email exists, OTP has been sent.',
            success: true,
          },
        };
      }

      const otp = this.generateOtp();
      const expMin = Number(process.env.PASSWORD_RESET_OTP_EXP_MINUTES || 10);
      const expiresAt = new Date(Date.now() + expMin * 60_000);

      await this.mongo.collection('password_reset_otps').insertOne({
        user_id: user.user_id || null,
        userObjectId: user._id,
        email,
        otpHash: this.sha256(otp),
        expiresAt,
        usedAt: null,
        createdAt: new Date(),
      });

      // console.log('PASSWORD RESET OTP:', {
      //   email,
      //   otp,
      //   expiresInMinutes: expMin,
      // });

      const subject = `${process.env.APP_NAME || 'GRC3'} Password Reset OTP`;

      const html = `
        <div style="font-family: Arial, sans-serif; background-color: #f5f7fb; padding: 30px;">
          <div style="max-width: 520px; margin: auto; background: #ffffff; border-radius: 10px; padding: 30px; border: 1px solid #e5e7eb;">
            <h2 style="margin-top: 0; color: #111827;">Password Reset Request</h2>
      
            <p style="font-size: 15px; color: #374151;">
              Hello ${user.user_name || user.first_name || 'User'},
            </p>
      
            <p style="font-size: 15px; color: #374151;">
              We received a request to reset your password. Use the OTP below to continue:
            </p>
      
            <div style="text-align: center; margin: 30px 0;">
              <div style="display: inline-block; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #111827; background: #f3f4f6; padding: 16px 24px; border-radius: 8px;">
                ${otp}
              </div>
            </div>
      
            <p style="font-size: 14px; color: #374151;">
              This OTP will expire in <strong>${expMin} minutes</strong>.
            </p>
      
            <p style="font-size: 14px; color: #6b7280;">
              If you did not request this password reset, you can safely ignore this email.
            </p>
      
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      
            <p style="font-size: 12px; color: #9ca3af; text-align: center;">
              ${process.env.APP_NAME || 'GRC3'} Security Notification
            </p>
          </div>
        </div>
      `;

      const text = `
      Password Reset Request
      
      Hello ${user.user_name || user.first_name || 'User'},
      
      Your password reset OTP is: ${otp}
      
      This OTP will expire in ${expMin} minutes.
      
      If you did not request this password reset, you can safely ignore this email.
      `;

      await this.sendMail(email, subject, text, html);

      return {
        statusCode: 200,
        body: {
          message: 'If this email exists, OTP has been sent.',
          success: true,
        },
      };
    } catch (error) {
      console.error('PASSWORD RESET REQUEST ERROR:', error);

      return {
        statusCode: 500,
        body: {
          message: 'Something went wrong',
          success: false,
        },
      };
    }
  }

  async confirmPasswordResetLikeDjango(
    req: Request,
    emailRaw: any,
    otpRaw: any,
    newPasswordRaw: any,
  ) {
    try {
      const email = this.normalizeEmail(emailRaw);
      const otp = otpRaw ? String(otpRaw).trim() : '';
      const newPassword = newPasswordRaw ? String(newPasswordRaw) : '';

      if (!email || !otp || !newPassword) {
        return {
          statusCode: 400,
          body: {
            message: 'Email, OTP and new password are required',
            success: false,
          },
        };
      }

      if (newPassword.length < 8) {
        return {
          statusCode: 400,
          body: {
            message: 'Password must be at least 8 characters long',
            success: false,
          },
        };
      }

      const escaped = this.escapeRegexExact(email);

      const user = await this.mongo.collection('users').findOne({
        $or: [
          { email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
          { user_email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        ],
        is_deleted: { $ne: true },
      });

      if (!user) {
        return {
          statusCode: 400,
          body: {
            message: 'Invalid reset request',
            success: false,
          },
        };
      }

      const otpRecord = await this.mongo
        .collection('password_reset_otps')
        .findOne({
          email,
          otpHash: this.sha256(otp),
          usedAt: null,
          expiresAt: { $gt: new Date() },
        });

      if (!otpRecord) {
        return {
          statusCode: 400,
          body: {
            message: 'Invalid or expired OTP',
            success: false,
          },
        };
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);

      await this.mongo.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            password: passwordHash,
            isPasswordChanged: true,
            passwordChangedAt: new Date(),
            updatedAt: new Date(),
            lastUpdatedAt: new Date(),
            lastUpdatedBy: email,
          },
          $unset: {
            tempPassword: '',
          },
        },
      );

      await this.mongo.collection('password_reset_otps').updateOne(
        { _id: otpRecord._id },
        {
          $set: {
            usedAt: new Date(),
          },
        },
      );

      // revoke existing refresh tokens
      if (user.user_id) {
        await this.mongo.collection('refresh_tokens').updateMany(
          { user_id: user.user_id },
          {
            $set: {
              revokedAt: new Date(),
            },
          },
        );
      }

      return {
        statusCode: 200,
        body: {
          message:
            'Password reset successful. Please login with your new password.',
          success: true,
          forceRelogin: true,
        },
      };
    } catch (error) {
      console.error('PASSWORD RESET CONFIRM ERROR:', error);

      return {
        statusCode: 500,
        body: {
          message: 'Something went wrong',
          success: false,
        },
      };
    }
  }

  async updatePasswordAfterFirstLogin(req: Request, body: any) {
    const old_password = body?.old_password
      ? String(body.old_password).trim()
      : body?.oldPassword
        ? String(body.oldPassword).trim()
        : '';

    const new_password = body?.new_password
      ? String(body.new_password).trim()
      : body?.newPassword
        ? String(body.newPassword).trim()
        : '';

    const confirm_password = body?.confirm_new_password
      ? String(body.confirm_new_password).trim()
      : body?.confirm_password
        ? String(body.confirm_password).trim()
        : body?.confirmNewPassword
          ? String(body.confirmNewPassword).trim()
          : '';

    if (!old_password) {
      return { statusCode: 400, body: 'Please Submit Old Password' };
    }

    if (!new_password) {
      return { statusCode: 400, body: 'Please Submit New Password' };
    }

    if (confirm_password && new_password !== confirm_password) {
      return {
        statusCode: 400,
        body: 'New Password and Confirm Password do not match',
      };
    }

    if (old_password === new_password) {
      return {
        statusCode: 400,
        body: 'New Password must be different from Old Password',
      };
    }

    let authUser: any = null;
    try {
      authUser = await this.requireUserFromAccess(req);
    } catch {
      authUser = null;
    }

    const bodyEmail = this.normalizeEmail(
      body?.email || body?.user_email || body?.username || '',
    );

    const bodyUserId =
      body?.user_id !== undefined && body?.user_id !== null
        ? Number(body.user_id)
        : null;

    const rawIdentifier = String(
      authUser?.user_uuid ||
        authUser?._id ||
        authUser?.id ||
        authUser?.user_id ||
        body?.user_uuid ||
        body?._id ||
        body?.id ||
        body?.user_id ||
        bodyEmail ||
        '',
    ).trim();

    const resolvedEmail = this.normalizeEmail(
      authUser?.email || authUser?.user_email || bodyEmail || '',
    );

    const or: any[] = [];

    if (rawIdentifier && mongoose.Types.ObjectId.isValid(rawIdentifier)) {
      or.push({ _id: new mongoose.Types.ObjectId(rawIdentifier) });
    }

    if (rawIdentifier) {
      or.push({ user_uuid: rawIdentifier });
    }

    if (bodyUserId !== null && !Number.isNaN(bodyUserId)) {
      or.push({ user_id: bodyUserId });
    }

    const numericIdentifier = Number(rawIdentifier);
    if (
      !Number.isNaN(numericIdentifier) &&
      Number.isFinite(numericIdentifier)
    ) {
      or.push({ user_id: numericIdentifier });
    }

    if (resolvedEmail) {
      const escaped = this.escapeRegexExact(resolvedEmail);
      or.push({ email: { $regex: new RegExp(`^${escaped}$`, 'i') } });
      or.push({ user_email: { $regex: new RegExp(`^${escaped}$`, 'i') } });
    }

    if (!or.length) {
      return {
        statusCode: 400,
        body: 'Email or user identifier is required',
      };
    }

    const dbUser = await this.mongo.collection('users').findOne({ $or: or });

    // console.log('UPDATE PASSWORD DEBUG:', {
    //   bodyEmail,
    //   bodyUserId,
    //   rawIdentifier,
    //   resolvedEmail,
    //   foundUser: !!dbUser,
    //   foundUserEmail: dbUser?.email || dbUser?.user_email || null,
    //   foundUserId: dbUser?.user_id || null,
    // });

    if (!dbUser) {
      return {
        statusCode: 404,
        body: 'User not found',
      };
    }

    if (!dbUser.password || typeof dbUser.password !== 'string') {
      return {
        statusCode: 400,
        body: 'Invalid User Password',
      };
    }

    let isValidPassword = false;

    try {
      isValidPassword = await bcrypt.compare(old_password, dbUser.password);
    } catch {
      isValidPassword = false;
    }

    if (!isValidPassword && dbUser?.tempPassword) {
      isValidPassword = String(dbUser.tempPassword).trim() === old_password;
    }

    if (!isValidPassword) {
      return {
        statusCode: 400,
        body: 'Invalid Old Password',
      };
    }

    const newHash = await bcrypt.hash(new_password, 12);

    await this.mongo.collection('users').updateOne(
      { _id: dbUser._id },
      {
        $set: {
          password: newHash,
          isPasswordChanged: true,
          passwordChangedAt: new Date(),
          last_login: new Date(),
          updatedAt: new Date(),
          lastUpdatedAt: new Date(),
          lastUpdatedBy: resolvedEmail || this.resolveEmailFromUser(dbUser),
        },
        $unset: {
          tempPassword: '',
        },
      },
    );

    return {
      statusCode: 200,
      body: {
        message:
          'Password updated successfully. Please login with your new password.',
        success: true,
        forceRelogin: true,
      },
    };
  }
}
