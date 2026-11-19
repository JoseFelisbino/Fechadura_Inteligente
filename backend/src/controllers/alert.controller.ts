import type { Request, Response } from 'express';
import { parseOrThrow } from '../middlewares/validate';
import { alertService } from '../services/alert.service';
import { sendData } from '../utils/response';
import { alertQuerySchema, resolveAlertSchema } from '../validators/alert.validator';
import { idParamsSchema } from '../validators/common';

export const alertController = {
  async list(req: Request, res: Response) {
    const query = parseOrThrow(alertQuerySchema, req.query);
    const { items, meta } = await alertService.list(query);
    return sendData(res, items, 200, meta);
  },
  async active(_req: Request, res: Response) {
    return sendData(res, await alertService.listActive());
  },
  async resolve(req: Request, res: Response) {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const { note } = parseOrThrow(resolveAlertSchema, req.body ?? {});
    return sendData(res, await alertService.resolve(id, req.user!.id, note));
  },
};
