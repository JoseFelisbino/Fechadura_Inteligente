import type { NextFunction, Request, Response } from 'express';
import { authenticateDevice } from '../services/device.service';
import { HttpError } from '../utils/http-error';

/**
 * Autenticação própria dos dispositivos (separada da autenticação do painel).
 * Cabeçalhos: `X-Device-Id: <uuid>` e `X-Device-Key: <credencial>`.
 * A credencial é comparada com o hash bcrypt armazenado em `Device.deviceKeyHash`.
 */
export async function requireDevice(req: Request, _res: Response, next: NextFunction) {
  const deviceId = req.header('x-device-id');
  const deviceKey = req.header('x-device-key');
  if (!deviceId || !deviceKey) {
    return next(HttpError.unauthorized('Credenciais do dispositivo ausentes.'));
  }
  const device = await authenticateDevice(deviceId, deviceKey);
  if (!device) return next(HttpError.unauthorized('Credenciais do dispositivo inválidas.'));
  req.device = device;
  next();
}
