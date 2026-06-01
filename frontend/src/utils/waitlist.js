export const WAITLIST_JOINED_KEY = 'moodfood_waitlist_joined';

export function isWaitlistJoined() {
  try {
    return sessionStorage.getItem(WAITLIST_JOINED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWaitlistJoined() {
  try {
    sessionStorage.setItem(WAITLIST_JOINED_KEY, '1');
  } catch {
    // ignore
  }
}

export async function submitWaitlist(payload) {
  const response = await fetch('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to join waitlist');
  }

  return response.json();
}
