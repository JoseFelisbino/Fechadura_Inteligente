import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

const DEVICE_KEY_ROUNDS = 10;

/** Gera uma credencial aleatória para o dispositivo (exibida uma única vez no terminal). */
export function generateDeviceKey(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function hashDeviceKey(key: string): Promise<string> {
  return bcrypt.hash(key, DEVICE_KEY_ROUNDS);
}

export function verifyDeviceKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}
