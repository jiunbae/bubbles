import type { Place } from '@bubbles/shared';

export interface ActionLog {
  id: string;
  placeId: string;
  action: string;
  actorName: string;
  details: string;
  createdAt: string;
}

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('bubbles_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options?.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchPlaces(): Promise<Place[]> {
  return request<Place[]>('/places');
}

export async function createPlace(name: string, theme: string = 'rooftop'): Promise<Place> {
  return request<Place>('/places', {
    method: 'POST',
    body: JSON.stringify({ name, theme }),
  });
}

export async function getPlace(id: string): Promise<Place> {
  return request<Place>(`/places/${id}`);
}

export async function getPlaceLogs(
  placeId: string,
  page = 1,
): Promise<{ logs: ActionLog[]; total: number }> {
  return request<{ logs: ActionLog[]; total: number }>(
    `/places/${placeId}/logs?page=${page}`,
  );
}
