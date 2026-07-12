const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

export async function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: eventName, properties: properties || {} }),
    });
  } catch {
    // Analytics should never crash the app
  }
}
