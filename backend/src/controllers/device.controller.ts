import type { Request, Response } from 'express';
import { parseOrThrow } from '../middlewares/validate';
import { deviceService } from '../services/device.service';
import { sendData } from '../utils/response';
import { idParamsSchema } from '../validators/common';
import { createDeviceSchema, updateDeviceSchema } from '../validators/device.validator';

export const deviceController = {
  async list(_req: Request, res: Response) {
    return sendData(res, await deviceService.list());
  },
  async get(req: Request, res: Response) {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    return sendData(res, await deviceService.get(id));
  },
  async create(req: Request, res: Response) {
    const input = parseOrThrow(createDeviceSchema, req.body);
    return sendData(res, await deviceService.create(input), 201);
  },
  async update(req: Request, res: Response) {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const input = parseOrThrow(updateDeviceSchema, req.body);
    return sendData(res, await deviceService.update(id, input));
  },
  async status(req: Request, res: Response) {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    return sendData(res, await deviceService.status(id));
  },
};
