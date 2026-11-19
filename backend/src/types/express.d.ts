import type { AuthDevice, AuthUser } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      device?: AuthDevice;
    }
  }
}

export {};
