import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../config/env';
import { parseOrThrow } from '../middlewares/validate';
import { authService } from '../services/auth.service';
import { sendData } from '../utils/response';
import { loginSchema } from '../validators/auth.validator';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

export const authController = {
  async login(req: Request, res: Response) {
    const input = parseOrThrow(loginSchema, req.body);
    const { token, user } = await authService.login(input);
    res.cookie(env.COOKIE_NAME, token, { ...cookieOptions(), maxAge: env.JWT_EXPIRES_IN_SECONDS * 1000 });
    return sendData(res, user);
  },

  async logout(_req: Request, res: Response) {
    res.clearCookie(env.COOKIE_NAME, cookieOptions());
    return sendData(res, { loggedOut: true });
  },

  async me(req: Request, res: Response) {
    return sendData(res, await authService.me(req.user!.id));
  },
};
