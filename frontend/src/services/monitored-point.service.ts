import type { MonitoredPoint, PointType } from '../types';
import { api } from './api';

export interface PointInput {
  name: string;
  location: string;
  type: PointType;
  maxOpenSeconds: number;
  deviceId: string;
}

export const monitoredPointService = {
  list: () => api.get<MonitoredPoint[]>('/monitored-points'),
  get: (id: string) => api.get<MonitoredPoint>(`/monitored-points/${id}`),
  create: (input: PointInput) => api.post<MonitoredPoint>('/monitored-points', input),
  update: (id: string, input: Partial<PointInput>) => api.patch<MonitoredPoint>(`/monitored-points/${id}`, input),
};
