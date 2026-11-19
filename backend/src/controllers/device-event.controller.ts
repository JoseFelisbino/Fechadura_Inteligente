import type { Request, Response } from 'express';
import { parseOrThrow } from '../middlewares/validate';
import { deviceEventService } from '../services/device-event.service';
import { sendData } from '../utils/response';
import { accessEventSchema, heartbeatSchema, sensorEventSchema } from '../validators/device-event.validator';

/** Eventos dos dispositivos via HTTP (canal de testes/contingência; o canal principal é MQTT). */
export const deviceEventController = {
  async access(req: Request, res: Response) {
    const input = parseOrThrow(accessEventSchema, req.body);
    const { duplicate, event } = await deviceEventService.ingestAccess(req.device!, input);
    return sendData(res, { id: event.id, duplicate }, duplicate ? 200 : 201);
  },
  async sensor(req: Request, res: Response) {
    const input = parseOrThrow(sensorEventSchema, req.body);
    const { duplicate, applied, event } = await deviceEventService.ingestSensor(req.device!, input);
    return sendData(res, { id: event.id, state: event.state, duplicate, applied }, duplicate ? 200 : 201);
  },
  async heartbeat(req: Request, res: Response) {
    const input = parseOrThrow(heartbeatSchema, req.body ?? {});
    return sendData(res, await deviceEventService.heartbeat(req.device!, input));
  },
};
