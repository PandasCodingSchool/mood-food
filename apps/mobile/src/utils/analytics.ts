import { API_BASE_URL, getHeaders } from '../services/apiBase';

export async function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/analytics`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ event: eventName, properties: properties || {} }),
    });
  } catch {
    // Analytics should never crash the app
  }
}
