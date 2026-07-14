import { API_BASE_URL, getHeaders } from './apiBase';

export interface AppNotification {
  id: string;
  type: 'order' | 'info' | 'promo' | 'swiggy';
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

export async function fetchNotifications(): Promise<NotificationsResponse> {
  const res = await fetch(`${API_BASE_URL}/user/notifications`, {
    headers: await getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json() as Promise<NotificationsResponse>;
}

export async function markAllRead(): Promise<void> {
  await fetch(`${API_BASE_URL}/user/notifications/read`, {
    method: 'PATCH',
    headers: await getHeaders(),
  });
}

export async function markOneRead(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/user/notifications/${id}/read`, {
    method: 'PATCH',
    headers: await getHeaders(),
  });
}
