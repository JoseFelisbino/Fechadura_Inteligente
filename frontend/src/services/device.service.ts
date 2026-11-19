import type { Device } from '../types';
import { api } from './api';

export interface DeviceInput {
  name: string;
  description?: string;
}

export const deviceService = {
  list: () => api.get<Device[]>('/devices'),
  get: (id: string) => api.get<Device>(`/devices/${id}`),
  create: (input: DeviceInput) => api.post<Device>('/devices', input),
  update: (id: string, input: Partial<DeviceInput>) => api.patch<Device>(`/devices/${id}`, input),
};
