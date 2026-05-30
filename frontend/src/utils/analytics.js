// Analytics tracking utility
// In production, replace with Google Analytics, PostHog, or Mixpanel

const ANALYTICS_ENDPOINT = '/api/analytics';

export const trackEvent = async (eventName, properties = {}) => {
  const eventData = {
    event: eventName,
    properties: {
      ...properties,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    },
  };

  // Log to console for development
  console.log('Analytics:', eventData);

  // Send to backend
  try {
    await fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    });
  } catch (error) {
    console.error('Analytics error:', error);
  }
};

export default trackEvent;
