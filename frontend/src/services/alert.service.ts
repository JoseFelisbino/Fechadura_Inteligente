import type { Alert, AlertStatus, Paginated } from '../types';
import { api } from './api';

export const alertService = {
  list: (query: { status?: AlertStatus; page?: number; pageSize?: number } = {}): Promise<Paginated<Alert>> =>
    api.getPage<Alert>('/alerts', query),
  active: () => api.get<Alert[]>('/alerts/active'),
  resolve: (id: string, note?: string) => api.patch<Alert>(`/alerts/${id}/resolve`, note ? { note } : {}),
};
