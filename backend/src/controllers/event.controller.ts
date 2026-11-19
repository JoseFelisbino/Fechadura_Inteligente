import type { Request, Response } from 'express';
import { parseOrThrow } from '../middlewares/validate';
import { eventService } from '../services/event.service';
import { sendData } from '../utils/response';
import { idParamsSchema } from '../validators/common';
import { directionSchema, eventQuerySchema } from '../validators/event.validator';

export const eventController = {
  async list(req: Request, res: Response) {
    const query = parseOrThrow(eventQuerySchema, req.query);
    const { items, meta } = await eventService.list(query);
    return sendData(res, items, 200, meta);
  },
  async setDirection(req: Request, res: Response) {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const { direction } = parseOrThrow(directionSchema, req.body);
    return sendData(res, await eventService.setDirection(id, direction, req.user!.id));
  },
};
