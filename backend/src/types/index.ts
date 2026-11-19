import type { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface AuthDevice {
  id: string;
  name: string;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
}

/** Canal pelo qual um evento de dispositivo chegou. */
export type IngestChannel = 'HTTP' | 'MQTT';

export interface IngestResult<T> {
  duplicate: boolean;
  event: T;
}
