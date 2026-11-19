export type UserRole = 'ADMIN' | 'VIEWER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type DeviceStatusValue = 'ONLINE' | 'OFFLINE';

export interface Device {
  id: string;
  name: string;
  description: string | null;
  status: DeviceStatusValue;
  lastSeenAt: string | null;
  /** Indica se a credencial já foi provisionada (a credencial em si nunca chega ao frontend). */
  hasCredential: boolean;
  pointsCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PointType = 'DOOR' | 'WINDOW';
export type PointState = 'OPEN' | 'CLOSED' | 'UNKNOWN';
export type SensorState = 'OPEN' | 'CLOSED';

export interface MonitoredPoint {
  id: string;
  name: string;
  location: string;
  type: PointType;
  currentState: PointState;
  lastKnownState: SensorState | null;
  stateChangedAt: string | null;
  lastEventAt: string | null;
  openSince: string | null;
  maxOpenSeconds: number;
  device: { id: string; name: string; status: DeviceStatusValue; lastSeenAt: string | null };
  createdAt: string;
  updatedAt: string;
}

export type EventCategory = 'ACCESS' | 'SENSOR';
export type EventType =
  | 'ACCESS_GRANTED'
  | 'ACCESS_DENIED'
  | 'LOCKOUT_STARTED'
  | 'LOCKOUT_ENDED'
  | 'LOCK_RELEASED'
  | 'SENSOR_STATE_CHANGED';
export type Direction = 'ENTRY' | 'EXIT' | 'UNKNOWN';
export type EventResult = 'SUCCESS' | 'FAILURE';

export interface HistoryEvent {
  id: string;
  category: EventCategory;
  eventType: EventType;
  result: EventResult | null;
  state: SensorState | null;
  direction: Direction | null;
  deviceId: string;
  deviceName: string;
  pointId: string | null;
  pointName: string | null;
  pointLocation: string | null;
  occurredAt: string;
  receivedAt: string;
}

export type AlertType = 'OPEN_TOO_LONG' | 'DEVICE_OFFLINE';
export type AlertStatus = 'ACTIVE' | 'RESOLVED';

export interface Alert {
  id: string;
  type: AlertType;
  status: AlertStatus;
  message: string;
  monitoredPoint: { id: string; name: string; location: string; type: PointType } | null;
  device: { id: string; name: string } | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
  resolutionNote: string | null;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface EventFilters {
  from?: string;
  to?: string;
  deviceId?: string;
  pointId?: string;
  category?: EventCategory;
  eventType?: EventType;
  result?: EventResult;
  state?: SensorState;
  page?: number;
  pageSize?: number;
}
