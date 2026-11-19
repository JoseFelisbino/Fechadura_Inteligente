import type { Request, Response } from 'express';
import { parseOrThrow } from '../middlewares/validate';
import { eventService } from '../services/event.service';
import { monitoredPointService } from '../services/monitored-point.service';
import { sendData } from '../utils/response';
import { idParamsSchema, paginationSchema } from '../validators/common';
import { createPointSchema, updatePointSchema } from '../validators/monitored-point.validator';

export const monitoredPointController = {
  async list(_req: Request, res: Response) {
    return sendData(res, await monitoredPointService.list());
  },
  async get(req: Request, res: Response) {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    return sendData(res, await monitoredPointService.get(id));
  },
  async create(req: Request, res: Response) {
    const input = parseOrThrow(createPointSchema, req.body);
    return sendData(res, await monitoredPointService.create(input), 201);
  },
  async update(req: Request, res: Response) {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const input = parseOrThrow(updatePointSchema, req.body);
    return sendData(res, await monitoredPointService.update(id, input));
  },
  async events(req: Request, res: Response) {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const { page, pageSize } = parseOrThrow(paginationSchema, req.query);
    await monitoredPointService.get(id);
    const { items, meta } = await eventService.list({ pointId: id, category: 'SENSOR', page, pageSize });
    return sendData(res, items, 200, meta);
  },
};
