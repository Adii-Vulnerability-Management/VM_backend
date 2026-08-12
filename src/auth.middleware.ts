
// import { Injectable, NestMiddleware } from '@nestjs/common';
// import { Request, Response, NextFunction } from 'express';
// import axios from 'axios';
// import * as cookie from 'cookie';
// import { GlobalStoreService } from './global-store/global-store.service';
// import { InjectConnection } from '@nestjs/mongoose';
// import mongoose, { Types } from 'mongoose';
// import { dummy_user_data } from './main';
// import * as geoIp2 from 'geoip-lite2';

// import { EntityManager } from 'typeorm';
// import { InjectEntityManager } from '@nestjs/typeorm';
// import { RedisService } from './redis/redis.service';

// @Injectable()
// export class AuthMiddleware implements NestMiddleware {
//     constructor(
//         @InjectConnection() private readonly mongoConnection: mongoose.Connection,
//         private readonly globalStoreService: GlobalStoreService,
//         // @InjectEntityManager() private readonly entityManager: EntityManager,
//         private readonly entityManager: EntityManager,
//         private readonly redisService: RedisService,
//     ) {
//         this.use = this.use.bind(this);
//     }

//     async use(req: Request, res: Response, next: NextFunction) {
//         const ip: string = req.headers['x-forwarded-for'] as string;

//         // Extract Access Token
//         let accessToken = req.headers['authorization'];
//         if (accessToken && accessToken.startsWith('Bearer ')) {
//             accessToken = accessToken.split(' ')[1];
//         } else {
//             accessToken = null;
//         }
//         // Extract Refresh Token
//         const refreshToken = req.headers['x-refresh-token'] || null;
//         // console.log("accessToken", accessToken);
//         // console.log("refreshToken", refreshToken);

//         let axiosConfig = null;

//         if (req.headers.cookie) {
//             // const cookiesArray = req.headers.cookie.split('; ');
//             // const cookieMap: { [key: string]: string } = {};
//             // cookiesArray.forEach(cookie => {
//             //     const [key, value] = cookie.split('=');
//             //     cookieMap[key] = value;
//             // });
//             // req['refresh'] = cookieMap['refresh'];

//             const cookieHeader = req.headers.cookie;
//             const parsedCookies = cookie.parse(cookieHeader || '');

//             req['refresh'] = parsedCookies['refresh'];

//             if (parsedCookies['refresh']) {
//                 axiosConfig = {
//                     headers: {
//                         host: req.headers.host,
//                         'x-real-ip': req.headers['x-real-ip'],
//                         'x-forwarded-for': req.headers['x-forwarded-for'],
//                         'x-forwarded-proto': req.headers['x-forwarded-proto'],
//                         connection: req.headers.connection,
//                         pragma: req.headers.pragma,
//                         'cache-control': req.headers['cache-control'],
//                         accept: req.headers.accept,
//                         'user-agent': req.headers['user-agent'],
//                         referer: req.headers.referer,
//                         'accept-encoding': req.headers['accept-encoding'],
//                         'accept-language': req.headers['accept-language'],
//                         cookie: req.headers.cookie
//                     },
//                 };
//             }
//         }

//         if (accessToken && refreshToken) {
//             if (!req['refresh']) {
//                 req['refresh'] = refreshToken;
//             }

//             axiosConfig = {
//                 headers: {
//                     authorization: `Bearer ${accessToken}`,
//                     'x-refresh-token': refreshToken,
//                     host: req.headers.host,
//                     'x-real-ip': req.headers['x-real-ip'],
//                     'x-forwarded-for': req.headers['x-forwarded-for'],
//                     'x-forwarded-proto': req.headers['x-forwarded-proto'],
//                     connection: req.headers.connection,
//                     accept: req.headers.accept,
//                     'user-agent': req.headers['user-agent'],
//                     referer: req.headers.referer,
//                     'accept-encoding': req.headers['accept-encoding'],
//                     'accept-language': req.headers['accept-language']
//                 },
//             };
//         }
//         // console.log("axiosConfig", axiosConfig);

//         // const geo = geoIp2.lookup(ip);
//         // console.log('geo ',geo);

//         try {
//             const geojs_response = await axios.get(`https://get.geojs.io/v1/ip/geo/${ip}.json`);
//         } catch (error) {
//         }

//         // try{
//         //     const ip_api_response = await axios.get(`http://ip-api.com/json/${ip}`);
//         //     console.log("ip_api_response.data ",ip_api_response.data)
//         // } catch (error){
//         //     console.log("ip_api_response_error ",error);
//         // }

//         const API_PREFIX = process.env.API_PREFIX;

//         // const unprotect_urls = [
//         //     `/${API_PREFIX}/cookies-banner`,
//         //     `/${API_PREFIX}/cookies-banner/cookies-consent-data`,
//         //     `/${API_PREFIX}/cookies-banner/cookies-req-data`,
//         // ]

//         // console.log('parsedurl ',req['_parsedUrl']);
//         const url_pathname = req['_parsedUrl']['pathname'];
//         const url_pathname_parts = url_pathname.split("/");
//         const extracted_url = url_pathname_parts.slice(0, 3).join('/');


//         // if (unprotect_urls.includes(extracted_url)) {
//         //     return next();
//         // }

//         if (/^true$/i.test(process.env.DEBUG)) {
//             // console.log("DEBUG: ",process.env.DEBUG);

//             req['user_type'] = process.env.SUPER_USER_ADMIN_TYPE;
//             const dummy_user_data_from_mongoDB = await this.mongoConnection.collection("users").findOne({ email: dummy_user_data.email });

//             delete dummy_user_data_from_mongoDB._id;
//             dummy_user_data_from_mongoDB.id = dummy_user_data_from_mongoDB.user_id;
//             delete dummy_user_data_from_mongoDB.user_id;
//             dummy_user_data_from_mongoDB.profile_img = `https://grcbucket.s3.amazonaws.com/${dummy_user_data_from_mongoDB.profile_img_path}`;
//             delete dummy_user_data_from_mongoDB.profile_img_path;

//             delete dummy_user_data_from_mongoDB.__v;
//             delete dummy_user_data_from_mongoDB.createdAt;
//             delete dummy_user_data_from_mongoDB.updatedAt;
//             delete dummy_user_data_from_mongoDB.password;

//             req['user_data'] = dummy_user_data_from_mongoDB;
//             // console.log("dummy_user_data_from_mongoDB", req['user_data']);

//             return next();
//         } else if (axiosConfig) {

//             const resource_url_routes_data = await this.mongoConnection.collection("resource_url_routes").find().toArray();
//             // const resource_url_routes_data = this.globalStoreService.getResourceUrlRoutesData();

//             if (req.url.startsWith('/apiv2jay')) {
//                 resource_url_routes_data.forEach(item => {
//                     item.url_route_access = item.url_route_access.map(url => url.replace(/apiv2/g, 'apiv2jay'));
//                 });
//             }
//             // console.log('resource_url_routes_data ',resource_url_routes_data[0]['resource_name']);

//             const resourcefilteredObjects = resource_url_routes_data.find(obj => obj.url_route_access.includes(extracted_url));

//             try {
//                 const response = await axios.get(process.env.LOGIN_CHECK_URL, axiosConfig);
//                 if (response.data.message === "You're authenticated!") {
//                     req['user_type'] = response.data.user_type;
//                     req['user_data'] = response.data.user_data;

//                     if (req['user_type'] !== process.env.SUPER_USER_ADMIN_TYPE) {
//                         // if (!unprotect_urls.includes(extracted_url)) {
//                         //     if (!(req.url === `/${API_PREFIX}/` || req.url === `/${API_PREFIX}/` || req.url.startsWith(`/${API_PREFIX}/test`))) {
//                         //         if (!resourcefilteredObjects) {
//                         //             return res.status(403).json({ message: "You don't have a subscription to access this resource." });
//                         //         }
//                         //         if (resourcefilteredObjects) {
//                         //             if (!req['user_data']['resources'].includes(resourcefilteredObjects.resource_name)) {
//                         //                 return res.status(403).json({ message: `You don't have a subscription to access this resource(${resourcefilteredObjects.resource_name}).` });
//                         //             }
//                         //         }
//                         //     }
//                         //     if (req.url.startsWith(`/${API_PREFIX}/test`)) {
//                         //         return res.status(403).json({ message: "You don't have a permission to access." });
//                         //     }
//                         // }
//                     }

//                     return next();
//                 } else {
//                     return res.status(500).send(response.data);
//                 }
//             } catch (error) {
//                 if (error.response) {
//                     if (error.response.data.detail === "Authentication credentials were not provided.") {
//                         return res.status(401).send('Authentication credentials were not provided.');
//                     } else if (error.response.data.detail === "Given token not valid for any token type") {
//                         try {
//                             const refresh_access_response = await axios.get(process.env.REFRESH_ACCESS_URL, axiosConfig);

//                             // Check if set-cookie header is present in the response
//                             if (refresh_access_response.headers['set-cookie']) {
//                                 const setCookieHeader = refresh_access_response.headers['set-cookie'];
//                                 res.setHeader('Set-Cookie', setCookieHeader);

//                                 // console.log("setCookieHeader ",setCookieHeader);
//                                 let user_data_from_cookies = null;
//                                 // const arr_cookieAttributes = setCookieHeader.map(cookie.parse); // Parse each cookie string
//                                 const arr_cookieAttributes = setCookieHeader.map(cookieString => cookie.parse(cookieString, undefined));
//                                 // console.log("arr_cookieAttributes ",arr_cookieAttributes);
//                                 const arr_obj_user_data_from_cookies: Record<string, any> = arr_cookieAttributes.find(cookie => cookie.hasOwnProperty('user_data'));
//                                 user_data_from_cookies = arr_obj_user_data_from_cookies.user_data.replace(/\\054/g, ",").replace(/\\/g, '');
//                                 if (user_data_from_cookies) {
//                                     req['user_data'] = JSON.parse(user_data_from_cookies);
//                                     if (req['user_data']['is_superuser'] === true && req['user_data']['is_staff'] === true && req['user_data']['is_active'] === true) {
//                                         req['user_type'] = process.env.SUPER_USER_ADMIN_TYPE;
//                                     } else {
//                                         // if (!unprotect_urls.includes(extracted_url)) {
//                                         //     if (!(req.url === `/${API_PREFIX}/` || req.url === `/${API_PREFIX}/` || req.url.startsWith(`/${API_PREFIX}/test`))) {
//                                         //         if (!resourcefilteredObjects) {
//                                         //             return res.status(403).json({ message: "You don't have a subscription to access this resource." });
//                                         //         }
//                                         //         if (resourcefilteredObjects) {
//                                         //             if (!req['user_data']['resources'].includes(resourcefilteredObjects.resource_name)) {
//                                         //                 return res.status(403).json({ message: `You don't have a subscription to access this resource(${resourcefilteredObjects.resource_name}).` });
//                                         //             }
//                                         //         }
//                                         //     }
//                                         //     if (req.url.startsWith(`/${API_PREFIX}/test`)) {
//                                         //         return res.status(403).json({ message: "You don't have a permission to access." });
//                                         //     }
//                                         // }
//                                         req['user_type'] = req['user_data']['user_designation'];
//                                     }
//                                 }
//                                 // console.log("req['user_data'] ",req['user_data']);

//                                 return next();
//                             }
//                         } catch (refresh_access_error) {
//                             return res.status(401).send(error.response.data);
//                         }
//                     } else {
//                         return res.status(500).send(error.response.data);
//                     }
//                 } else {
//                     return res.status(500).send('Something When Wrong! During Authentication.');
//                 }
//             }

//         } else {
//             return res.status(401).send('Authentication credentials were not provided.');
//         }

//     }
// }
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as cookie from 'cookie';
import { InjectConnection } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { GlobalStoreService } from './global-store/global-store.service';
import { dummy_user_data } from './main';
import { EntityManager } from 'typeorm';
import { RedisService } from './redis/redis.service';
import { AuthService } from './auth/auth.service';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    @InjectConnection() private readonly mongoConnection: mongoose.Connection,
    private readonly globalStoreService: GlobalStoreService,
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
  ) {
    this.use = this.use.bind(this);
  }

  private parseCookieMap(req: Request): Record<string, string> {
    try {
      return cookie.parse(req.headers.cookie || '');
    } catch {
      return {};
    }
  }

  private maskToken(token?: string | null): string | null {
    if (!token) return null;
    const t = String(token).trim();
    if (!t) return null;
    if (t.length <= 18) return t;
    return `${t.slice(0, 8)}...${t.slice(-8)}`;
  }

  private extractAccessToken(req: Request): string | null {
    const authHeader =
      (req.headers['authorization'] as string | undefined) ||
      (req.headers['Authorization'] as string | undefined);

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]?.trim() || null;

      // console.log('[AUTH_MIDDLEWARE][ACCESS_SOURCE]', {
      //   source: 'authorization_header',
      //   tokenPreview: this.maskToken(token),
      //   method: req.method,
      //   url: req.originalUrl || req.url,
      // });

      return token;
    }

    const parsedCookies = this.parseCookieMap(req);

    if (parsedCookies['access']) {
      const token = String(parsedCookies['access']).trim();

      // console.log('[AUTH_MIDDLEWARE][ACCESS_SOURCE]', {
      //   source: 'cookie_access',
      //   tokenPreview: this.maskToken(token),
      //   method: req.method,
      //   url: req.originalUrl || req.url,
      // });

      return token;
    }

    if (parsedCookies['access_token']) {
      const token = String(parsedCookies['access_token']).trim();

      // console.log('[AUTH_MIDDLEWARE][ACCESS_SOURCE]', {
      //   source: 'cookie_access_token',
      //   tokenPreview: this.maskToken(token),
      //   method: req.method,
      //   url: req.originalUrl || req.url,
      // });

      return token;
    }

    if (parsedCookies['token']) {
      const token = String(parsedCookies['token']).trim();

      // console.log('[AUTH_MIDDLEWARE][ACCESS_SOURCE]', {
      //   source: 'cookie_token',
      //   tokenPreview: this.maskToken(token),
      //   method: req.method,
      //   url: req.originalUrl || req.url,
      // });

      return token;
    }

    // console.log('[AUTH_MIDDLEWARE][ACCESS_SOURCE]', {
    //   source: 'none',
    //   method: req.method,
    //   url: req.originalUrl || req.url,
    // });

    return null;
  }

  private extractRefreshToken(req: Request): string | null {
    const parsedCookies = this.parseCookieMap(req);

    if (parsedCookies['refresh']) {
      return String(parsedCookies['refresh']).trim();
    }

    if (parsedCookies['refresh_token']) {
      return String(parsedCookies['refresh_token']).trim();
    }

    const rt = req.headers['x-refresh-token'];
    if (typeof rt === 'string' && rt.trim().length > 0) {
      return rt.trim();
    }

    return null;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const API_PREFIX = process.env.API_PREFIX;
    const currentUrl = req.originalUrl || req.url;
    const parsedCookies = this.parseCookieMap(req);

    const openRoutes = [
      `/${API_PREFIX}/login`,
      `/${API_PREFIX}/register`,
      `/${API_PREFIX}/token/refresh`,
      '/apiv1/login',
      '/apiv1/register',
      '/apiv1/token/refresh',
      '/apiv2/login',
      '/apiv2/register',
      '/apiv2/token/refresh',
      '/apiv2jay/login',
      '/apiv2jay/register',
      '/apiv2jay/token/refresh',
    ];

    if (openRoutes.some((route) => currentUrl.includes(route))) {
      // console.log('[AUTH_MIDDLEWARE][BYPASS_OPEN_ROUTE]', {
      //   method: req.method,
      //   url: currentUrl,
      // });

      if (!req['user_data']) {
        // console.error('[AUTH_MIDDLEWARE][BLOCKING_REQUEST_USER_DATA_NULL]', {
        //   method: req.method,
        //   url: currentUrl,
        //   authorizationHeaderPresent: !!req.headers['authorization'],
        //   cookiePresent: !!req.headers.cookie,
        // });
      
        return res.status(401).send('Authentication failed');
      }
      
      // console.log('[AUTH_MIDDLEWARE][BEFORE_NEXT]', {
      //   hasReqUserData: !!req['user_data'],
      //   email:
      //     req['user_data']?.email ||
      //     req['user_data']?.user_email ||
      //     req['user_data']?.username ||
      //     null,
      //   roles: req['user_data']?.roles || [],
      // });

      return next();
    }

    if (req.headers.cookie) {
      req['refresh'] = parsedCookies['refresh'];
    }

    const accessToken = this.extractAccessToken(req);
    const refreshToken = this.extractRefreshToken(req);

    if (!req['refresh'] && refreshToken) {
      req['refresh'] = refreshToken;
    }

    if (accessToken) {
      req.headers['authorization'] = `Bearer ${accessToken}`;
    }

    // console.log('[AUTH_MIDDLEWARE][TOKENS]', {
    //   method: req.method,
    //   url: currentUrl,
    //   authorizationHeaderPresent: !!req.headers['authorization'],
    //   cookiePresent: !!req.headers.cookie,
    //   accessCookiePresent: !!parsedCookies['access'],
    //   accessTokenCookiePresent: !!parsedCookies['access_token'],
    //   refreshCookiePresent: !!parsedCookies['refresh'],
    //   refreshTokenCookiePresent: !!parsedCookies['refresh_token'],
    //   xRefreshHeaderPresent: !!req.headers['x-refresh-token'],
    //   accessTokenPreview: this.maskToken(accessToken),
    //   refreshTokenPreview: this.maskToken(refreshToken),
    // });

    if (/^true$/i.test(process.env.DEBUG || '')) {
      req['user_type'] = process.env.SUPER_USER_ADMIN_TYPE;

      const dummy_user_data_from_mongoDB = await this.mongoConnection
        .collection('users')
        .findOne({ email: dummy_user_data.email });

      if (!dummy_user_data_from_mongoDB) {
        // console.error('[AUTH_MIDDLEWARE][DEBUG_USER_NOT_FOUND]', {
        //   email: dummy_user_data.email,
        // });
        return res.status(500).send('Dummy user not found in MongoDB');
      }

      delete (dummy_user_data_from_mongoDB as any)._id;
      (dummy_user_data_from_mongoDB as any).id = (
        dummy_user_data_from_mongoDB as any
      ).user_id;
      delete (dummy_user_data_from_mongoDB as any).user_id;

      if ((dummy_user_data_from_mongoDB as any).profile_img_path) {
        (dummy_user_data_from_mongoDB as any).profile_img =
          `https://grcbucket.s3.amazonaws.com/${
            (dummy_user_data_from_mongoDB as any).profile_img_path
          }`;
        delete (dummy_user_data_from_mongoDB as any).profile_img_path;
      }

      delete (dummy_user_data_from_mongoDB as any).__v;
      delete (dummy_user_data_from_mongoDB as any).createdAt;
      delete (dummy_user_data_from_mongoDB as any).updatedAt;
      delete (dummy_user_data_from_mongoDB as any).password;

      req['user_data'] = dummy_user_data_from_mongoDB;

      // console.log('[AUTH_MIDDLEWARE][DEBUG_MODE_USER]', {
      //   email:
      //     (req['user_data'] as any)?.email ||
      //     (req['user_data'] as any)?.user_email,
      //   userId: (req['user_data'] as any)?.id,
      //   roles: (req['user_data'] as any)?.roles || [],
      // });

      return next();
    }

    if (!accessToken && !refreshToken) {
      // console.warn('[AUTH_MIDDLEWARE][NO_TOKENS]', {
      //   method: req.method,
      //   url: currentUrl,
      // });
      return res
        .status(401)
        .send('Authentication credentials were not provided.');
    }

    const url_pathname = (req as any)?._parsedUrl?.pathname || req.url;
    const url_pathname_parts = url_pathname.split('/');
    const extracted_url = url_pathname_parts.slice(0, 3).join('/');

    const resource_url_routes_data = await this.mongoConnection
      .collection('resource_url_routes')
      .find()
      .toArray();

    if (req.url.startsWith('/apiv2jay')) {
      resource_url_routes_data.forEach((item: any) => {
        item.url_route_access = (item.url_route_access || []).map(
          (url: string) => url.replace(/apiv2/g, 'apiv2jay'),
        );
      });
    }

    const resourcefilteredObjects = resource_url_routes_data.find((obj: any) =>
      (obj.url_route_access || []).includes(extracted_url),
    );

    const trySetUserFromAuthCheck = async () => {
      // console.log('[AUTH_MIDDLEWARE][LOGIN_CHECK_START]', {
      //   method: req.method,
      //   url: currentUrl,
      //   authorizationHeaderPresent: !!req.headers['authorization'],
      //   refreshAttached: !!req['refresh'],
      // });

      const response = await this.authService.loginCheck(req);

      // console.log('[AUTH_MIDDLEWARE][AFTER_LOGIN_CHECK]', {
      //   responseUserType: response?.user_type || null,
      //   hasResponseUserData: !!response?.user_data,
      //   responseUserDataKeys: response?.user_data
      //     ? Object.keys(response.user_data)
      //     : [],
      // });

      req['user_type'] = response.user_type;
      req['user_data'] = response.user_data;
      // console.log('[AUTH_MIDDLEWARE][USER_DATA_AFTER_SET]', {
      //   user_data: req['user_data'],
      //   user_data_keys: req['user_data'] ? Object.keys(req['user_data']) : [],
      // });

      if (!req['user_data']) {
        req['user_data'] =
          (response as any)?.user ||
          (response as any)?.data?.user_data ||
          (response as any)?.data?.user ||
          null;
      }

      try {
        const rawEmail =
          req['user_data']?.email ||
          req['user_data']?.user_email ||
          req['user_data']?.username;

        const resolvedEmail = String(rawEmail || '')
          .toLowerCase()
          .trim();

        let dbUser: any = null;

        if (resolvedEmail) {
          dbUser = await this.mongoConnection.collection('users').findOne({
            $or: [{ email: resolvedEmail }, { user_email: resolvedEmail }],
          });
        }

        if (dbUser) {
          req['user_data'].roles = Array.isArray(dbUser.roles)
            ? dbUser.roles
            : [];
          req['user_data'].permissionKeys = Array.isArray(dbUser.permissionKeys)
            ? dbUser.permissionKeys
            : [];
          req['user_data'].modules = Array.isArray(dbUser.modules)
            ? dbUser.modules
            : [];
          const dbTenant = dbUser.tenant_id ?? dbUser.tenantId;
          if (dbTenant != null && String(dbTenant).trim()) {
            req['user_data'].tenant_id = String(dbTenant).trim();
          }
        } else {
          req['user_data'].roles = Array.isArray(req['user_data']?.roles)
            ? req['user_data'].roles
            : [];
          req['user_data'].permissionKeys = Array.isArray(
            req['user_data']?.permissionKeys,
          )
            ? req['user_data'].permissionKeys
            : [];
          req['user_data'].modules = Array.isArray(req['user_data']?.modules)
            ? req['user_data'].modules
            : [];
        }

        // console.log('[AUTH_MIDDLEWARE][LOGIN_CHECK_OK]', {
        //   method: req.method,
        //   url: currentUrl,
        //   userType: req['user_type'],
        //   resolvedEmail,
        //   userId: req['user_data']?.id || req['user_data']?.user_id || null,
        //   isSuperuser: req['user_data']?.is_superuser === true,
        //   isStaff: req['user_data']?.is_staff === true,
        //   isActive: req['user_data']?.is_active === true,
        // });

        // console.log('[AUTH_MIDDLEWARE][RBAC_ENRICH]', {
        //   method: req.method,
        //   url: currentUrl,
        //   resolvedEmail,
        //   roles: req['user_data']?.roles || [],
        //   modules: req['user_data']?.modules || [],
        //   permissionKeysLen: (req['user_data']?.permissionKeys || []).length,
        //   dbUserFound: !!dbUser,
        // });
      } catch (e: any) {
        req['user_data'].roles = req['user_data']?.roles || [];
        req['user_data'].permissionKeys =
          req['user_data']?.permissionKeys || [];
        req['user_data'].modules = req['user_data']?.modules || [];

        // console.error('[AUTH_MIDDLEWARE][RBAC_ENRICH_ERROR]', {
        //   method: req.method,
        //   url: currentUrl,
        //   message: e?.message || 'unknown error',
        // });
      }
    };

    try {
      await trySetUserFromAuthCheck();

      if (req['user_type'] !== process.env.SUPER_USER_ADMIN_TYPE) {
        /*
        if (!(req.url === `/${API_PREFIX}/` || req.url.startsWith(`/${API_PREFIX}/test`))) {
          if (!resourcefilteredObjects) {
            return res
              .status(403)
              .json({ message: "You don't have a subscription to access this resource." });
          }
          if (
            resourcefilteredObjects &&
            !req["user_data"]?.resources?.includes(resourcefilteredObjects.resource_name)
          ) {
            return res.status(403).json({
              message: `You don't have a subscription to access this resource(${resourcefilteredObjects.resource_name}).`,
            });
          }
        }
        */
      }

      // console.log('[AUTH_MIDDLEWARE][REQUEST_AUTHORIZED]', {
      //   method: req.method,
      //   url: currentUrl,
      //   resolvedEmail:
      //     req['user_data']?.email ||
      //     req['user_data']?.user_email ||
      //     req['user_data']?.username ||
      //     null,
      //   roles: req['user_data']?.roles || [],
      // });

      if (!req['user_data']) {
        // console.error('[AUTH_MIDDLEWARE][BLOCKING_REQUEST_USER_DATA_NULL]', {
        //   method: req.method,
        //   url: currentUrl,
        //   authorizationHeaderPresent: !!req.headers['authorization'],
        //   cookiePresent: !!req.headers.cookie,
        // });

        return res.status(401).send('Authentication failed');
      }

      // console.log('[AUTH_MIDDLEWARE][BEFORE_NEXT]', {
      //   hasReqUserData: !!req['user_data'],
      //   email:
      //     req['user_data']?.email ||
      //     req['user_data']?.user_email ||
      //     req['user_data']?.username ||
      //     null,
      //   roles: req['user_data']?.roles || [],
      // });

      return next();
    } catch (err: any) {
      const msg = String(err?.message || '');

      // console.error('[AUTH_MIDDLEWARE][LOGIN_CHECK_FAILED]', {
      //   method: req.method,
      //   url: currentUrl,
      //   message: msg || 'unknown error',
      // });

      const shouldTryRefresh =
        msg.includes('Given token not valid for any token type') ||
        msg.includes('Authentication credentials were not provided') ||
        msg.toLowerCase().includes('jwt expired') ||
        msg.toLowerCase().includes('expired');

      if (!shouldTryRefresh) {
        return res.status(401).send('Authentication failed');
      }

      if (!refreshToken) {
        // console.warn('[AUTH_MIDDLEWARE][REFRESH_SKIPPED_NO_REFRESH_TOKEN]', {
        //   method: req.method,
        //   url: currentUrl,
        // });
        return res
          .status(401)
          .send('Authentication credentials were not provided.');
      }

      try {
        // console.log('[AUTH_MIDDLEWARE][REFRESH_START]', {
        //   method: req.method,
        //   url: currentUrl,
        //   refreshTokenPreview: this.maskToken(refreshToken),
        // });

        const refreshResult = await this.authService.refresh(req, res);

        // use returned token instead of req
        let newAccessToken: string | null = null;

        if (
          refreshResult &&
          typeof refreshResult === 'object' &&
          'access_token' in refreshResult &&
          typeof (refreshResult as any).access_token === 'string'
        ) {
          newAccessToken = (refreshResult as any).access_token;
        }

        if (newAccessToken) {
          req.headers['authorization'] = `Bearer ${newAccessToken}`;
        }

        // await this.authService.refresh(req, res);

        // console.log('[AUTH_MIDDLEWARE][REFRESH_SUCCESS]', {
        //   method: req.method,
        //   url: currentUrl,
        // });

        // const newAccessToken = this.extractAccessToken(req);
        // if (newAccessToken) {
        //   req.headers['authorization'] = `Bearer ${newAccessToken}`;
        // }

        await trySetUserFromAuthCheck();

        if (
          req['user_data']?.is_superuser === true &&
          req['user_data']?.is_staff === true &&
          req['user_data']?.is_active === true
        ) {
          req['user_type'] = process.env.SUPER_USER_ADMIN_TYPE;
        } else {
          req['user_type'] =
            req['user_data']?.user_designation || req['user_type'];
        }

        // console.log('[AUTH_MIDDLEWARE][REQUEST_AUTHORIZED_AFTER_REFRESH]', {
        //   method: req.method,
        //   url: currentUrl,
        //   resolvedEmail:
        //     req['user_data']?.email ||
        //     req['user_data']?.user_email ||
        //     req['user_data']?.username ||
        //     null,
        //   roles: req['user_data']?.roles || [],
        //   userType: req['user_type'],
        // });

        if (!req['user_data']) {
          // console.error('[AUTH_MIDDLEWARE][BLOCKING_REQUEST_USER_DATA_NULL]', {
          //   method: req.method,
          //   url: currentUrl,
          //   authorizationHeaderPresent: !!req.headers['authorization'],
          //   cookiePresent: !!req.headers.cookie,
          // });

          return res.status(401).send('Authentication failed');
        }

        // console.log('[AUTH_MIDDLEWARE][BEFORE_NEXT]', {
        //   hasReqUserData: !!req['user_data'],
        //   email:
        //     req['user_data']?.email ||
        //     req['user_data']?.user_email ||
        //     req['user_data']?.username ||
        //     null,
        //   roles: req['user_data']?.roles || [],
        // });

        return next();
      } catch (refreshErr: any) {
        // console.error('[AUTH_MIDDLEWARE][REFRESH_FAILED]', {
        //   method: req.method,
        //   url: currentUrl,
        //   message: refreshErr?.message || 'unknown refresh error',
        // });
        return res.status(401).send('Authentication failed');
      }
    }
  }
}