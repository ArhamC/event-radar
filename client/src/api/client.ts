import type { AdminEvent, EventItem, GoodFor, User } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.issues) ? data.issues.map((i: { message: string }) => i.message).join('. ') : '';
    throw new ApiError(res.status, detail || data.error || 'Request failed');
  }
  return data as T;
}

export interface EventQuery {
  lat: number;
  lng: number;
  radiusM: number;
  from: Date;
  to: Date;
  tags: string[];
  free: boolean;
  q: string;
  goodFor: 'solo' | 'group' | null;
}

export interface NewEvent {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  priceCents: number;
  venue: { name: string; address?: string; lat: number; lng: number };
  tags: string[];
  goodFor: GoodFor;
}

export const api = {
  me: () => request<{ user: User | null }>('/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    request<{ user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  tags: () => request<{ tags: string[] }>('/tags'),

  events: (p: EventQuery, signal?: AbortSignal) => {
    const qs = new URLSearchParams({
      lat: String(p.lat),
      lng: String(p.lng),
      radius: String(p.radiusM),
      from: p.from.toISOString(),
      to: p.to.toISOString(),
    });
    if (p.tags.length) qs.set('tags', p.tags.join(','));
    if (p.free) qs.set('free', 'true');
    if (p.q) qs.set('q', p.q);
    if (p.goodFor) qs.set('goodFor', p.goodFor);
    return request<{ events: EventItem[] }>(`/events?${qs}`, { signal });
  },
  createEvent: (e: NewEvent) =>
    request<{ id: number; status: string }>('/events', { method: 'POST', body: JSON.stringify(e) }),
  favorite: (id: number) => request<{ favorite: boolean }>(`/events/${id}/favorite`, { method: 'POST' }),

  adminEvents: (status = 'pending') => request<{ events: AdminEvent[] }>(`/admin/events?status=${status}`),
  adminSetStatus: (id: number, status: 'approved' | 'rejected' | 'cancelled') =>
    request<{ id: number; status: string }>(`/admin/events/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
