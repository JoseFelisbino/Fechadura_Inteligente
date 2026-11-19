import type { Direction, EventFilters, HistoryEvent, Paginated } from '../types';
import { api } from './api';

export const eventService = {
  list: (filters: EventFilters = {}): Promise<Paginated<HistoryEvent>> =>
    api.getPage<HistoryEvent>('/events', { ...filters }),
  setDirection: (accessEventId: string, direction: Direction) =>
    api.patch<{ id: string; direction: Direction }>(`/events/access/${accessEventId}/direction`, { direction }),
};
