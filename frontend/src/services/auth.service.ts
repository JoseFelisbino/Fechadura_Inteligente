import type { User } from '../types';
import { api } from './api';

export const authService = {
  login: (email: string, password: string) => api.post<User>('/auth/login', { email, password }),
  logout: () => api.post<{ loggedOut: boolean }>('/auth/logout'),
  me: () => api.get<User>('/auth/me'),
};
