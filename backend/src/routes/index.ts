import { Router } from 'express';
import { alertController } from '../controllers/alert.controller';
import { authController } from '../controllers/auth.controller';
import { deviceEventController } from '../controllers/device-event.controller';
import { deviceController } from '../controllers/device.controller';
import { eventController } from '../controllers/event.controller';
import { monitoredPointController } from '../controllers/monitored-point.controller';
import { streamController } from '../controllers/stream.controller';
import { requireAuth, requireRole } from '../middlewares/auth';
import { csrfProtection } from '../middlewares/csrf';
import { requireDevice } from '../middlewares/device-auth';
import { deviceRateLimit, loginRateLimit, sensitiveRateLimit } from '../middlewares/rate-limit';

export function buildRouter() {
  const api = Router();

  api.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok', time: new Date().toISOString() } });
  });

  // ---- Eventos de dispositivos: autenticação própria (X-Device-Id / X-Device-Key), sem cookie.
  const deviceEvents = Router();
  deviceEvents.use(deviceRateLimit, requireDevice);
  deviceEvents.post('/access', deviceEventController.access);
  deviceEvents.post('/sensor', deviceEventController.sensor);
  deviceEvents.post('/heartbeat', deviceEventController.heartbeat);
  api.use('/device-events', deviceEvents);

  // ---- Painel: rotas autenticadas por cookie, protegidas contra CSRF.
  const panel = Router();
  panel.use(csrfProtection);

  panel.post('/auth/login', loginRateLimit, authController.login);
  panel.post('/auth/logout', authController.logout);
  panel.get('/auth/me', requireAuth, authController.me);

  panel.use(requireAuth);

  const admin = requireRole('ADMIN');

  panel.get('/stream', streamController);

  panel.get('/devices', deviceController.list);
  panel.get('/devices/:id', deviceController.get);
  panel.get('/devices/:id/status', deviceController.status);
  panel.post('/devices', sensitiveRateLimit, admin, deviceController.create);
  panel.patch('/devices/:id', sensitiveRateLimit, admin, deviceController.update);

  panel.get('/monitored-points', monitoredPointController.list);
  panel.get('/monitored-points/:id', monitoredPointController.get);
  panel.get('/monitored-points/:id/events', monitoredPointController.events);
  panel.post('/monitored-points', sensitiveRateLimit, admin, monitoredPointController.create);
  panel.patch('/monitored-points/:id', sensitiveRateLimit, admin, monitoredPointController.update);

  panel.get('/events', eventController.list);
  panel.patch('/events/access/:id/direction', sensitiveRateLimit, eventController.setDirection);

  panel.get('/alerts', alertController.list);
  panel.get('/alerts/active', alertController.active);
  panel.patch('/alerts/:id/resolve', sensitiveRateLimit, alertController.resolve);

  api.use(panel);
  return api;
}
