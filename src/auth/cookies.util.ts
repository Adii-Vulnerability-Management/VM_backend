import type { Request, Response } from 'express';
import * as cookie from 'cookie';

export function parseCookies(req: Request): Record<string, string> {
  try {
    const header = req?.headers?.cookie;
    if (!header) return {};
    return cookie.parse(header);
  } catch {
    return {};
  }
}

function cookieOpts() {
  const secure = /^true$/i.test(process.env.CUSTOM_TOKEN_COOKIE_SECURE || '');
  const sameSite = (process.env.CUSTOM_TOKEN_COOKIE_SAMESITE || 'lax') as
    'lax' | 'strict' | 'none';

  return { secure, sameSite };
}

// keep only very small user data if absolutely needed
function compactUserData(userData: any) {
  if (!userData || typeof userData !== 'object') return {};

  return {
    id: userData?.id ?? userData?.user_id ?? null,
    user_id: userData?.user_id ?? userData?.id ?? null,
    email: userData?.email ?? userData?.user_email ?? '',
    user_name: userData?.user_name ?? '',
    first_name: userData?.first_name ?? '',
    last_name: userData?.last_name ?? '',
    profile_img: userData?.profile_img ?? '',
    mfaEnabled: !!userData?.mfaEnabled,
    isPasswordChanged:
      typeof userData?.isPasswordChanged === 'boolean'
        ? userData.isPasswordChanged
        : null,
  };
}

export function setDjangoAuthCookies(
  res: Response,
  args: { accessToken: string; refreshToken: string; userData?: any },
) {
  const { secure, sameSite } = cookieOpts();

  const accessMaxAge = 2 * 3600;
  const refreshMaxAge = Number(
    process.env.REFRESH_COOKIE_MAX_AGE || 7 * 24 * 3600,
  );

  // ✅ Only store compact user data if explicitly enabled
  const shouldStoreUserDataCookie = /^true$/i.test(
    process.env.STORE_USER_DATA_COOKIE || 'false',
  );

  const compactUser = compactUserData(args.userData);
  const userDataStr = encodeURIComponent(JSON.stringify(compactUser));

  // ✅ httpOnly auth cookies
  res.cookie('access', args.accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: accessMaxAge * 1000,
    path: '/',
  });

  res.cookie('refresh', args.refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: refreshMaxAge * 1000,
    path: '/',
  });

  // ✅ Optional non-httpOnly access token only if legacy frontend still needs it
  const exposeAccessToken = /^true$/i.test(
    process.env.EXPOSE_ACCESS_TOKEN_COOKIE || 'false',
  );

  if (exposeAccessToken) {
    res.cookie('access_token', args.accessToken, {
      httpOnly: false,
      secure,
      sameSite,
      maxAge: accessMaxAge * 1000,
      path: '/',
    });
  } else {
    res.clearCookie('access_token', {
      path: '/',
      secure,
      sameSite,
    });
  }

  // ✅ Do NOT expose refresh token to JS
  res.clearCookie('refresh_token', {
    path: '/',
    secure,
    sameSite,
  });

  // ✅ Store only compact user data, and only if enabled
  if (shouldStoreUserDataCookie) {
    res.cookie('user_data', userDataStr, {
      httpOnly: false,
      secure,
      sameSite,
      maxAge: refreshMaxAge * 1000,
      path: '/',
    });
  } else {
    res.clearCookie('user_data', {
      path: '/',
      secure,
      sameSite,
    });
  }
}

export function setDjangoAccessOnlyCookies(
  res: Response,
  args: { accessToken: string; userData?: any },
) {
  const { secure, sameSite } = cookieOpts();

  const accessMaxAge = 2 * 3600;
  const refreshMaxAge = Number(
    process.env.REFRESH_COOKIE_MAX_AGE || 7 * 24 * 3600,
  );

  const shouldStoreUserDataCookie = /^true$/i.test(
    process.env.STORE_USER_DATA_COOKIE || 'false',
  );

  const compactUser = compactUserData(args.userData);
  const userDataStr = encodeURIComponent(JSON.stringify(compactUser));

  res.cookie('access', args.accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: accessMaxAge * 1000,
    path: '/',
  });

  const exposeAccessToken = /^true$/i.test(
    process.env.EXPOSE_ACCESS_TOKEN_COOKIE || 'false',
  );

  if (exposeAccessToken) {
    res.cookie('access_token', args.accessToken, {
      httpOnly: false,
      secure,
      sameSite,
      maxAge: accessMaxAge * 1000,
      path: '/',
    });
  } else {
    res.clearCookie('access_token', {
      path: '/',
      secure,
      sameSite,
    });
  }

  if (shouldStoreUserDataCookie) {
    res.cookie('user_data', userDataStr, {
      httpOnly: false,
      secure,
      sameSite,
      maxAge: refreshMaxAge * 1000,
      path: '/',
    });
  } else {
    res.clearCookie('user_data', {
      path: '/',
      secure,
      sameSite,
    });
  }
}

export function clearAllCookiesLikeDjango(req: Request, res: Response) {
  const { secure, sameSite } = cookieOpts();
  const cookies = parseCookies(req);

  for (const name of Object.keys(cookies || {})) {
    res.clearCookie(name, { path: '/', secure, sameSite });
  }

  for (const name of [
    'access',
    'refresh',
    'access_token',
    'refresh_token',
    'user_data',
  ]) {
    res.clearCookie(name, { path: '/', secure, sameSite });
  }
}
