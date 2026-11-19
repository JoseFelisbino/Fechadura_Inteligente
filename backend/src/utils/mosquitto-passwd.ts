import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Gera uma linha no formato do `mosquitto_passwd` (Mosquitto 2.x):
 *   usuario:$7$<iterações>$<salt base64>$<hash base64>
 * onde o hash é PBKDF2-HMAC-SHA512 com salt de 12 bytes.
 */
export function mosquittoPasswordEntry(username: string, password: string, iterations = 101): string {
  if (/[:\s]/.test(username)) throw new Error('Usuário MQTT não pode conter ":" ou espaços.');
  const salt = crypto.randomBytes(12);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512');
  return `${username}:$7$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Insere ou substitui o usuário no arquivo de senhas do Mosquitto. */
export function upsertMosquittoUser(filePath: string, username: string, password: string): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const existing = fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : '';
  const lines = existing
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '' && !l.startsWith(`${username}:`));
  lines.push(mosquittoPasswordEntry(username, password));
  fs.writeFileSync(resolved, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
}
