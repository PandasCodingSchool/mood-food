/**
 * Minimal SMS provider abstraction.
 * Supports `console` (logs the message for dev/testing) and `twilio`.
 * Configure via SMS_PROVIDER, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * and TWILIO_PHONE_NUMBER environment variables.
 */

const PROVIDER = (process.env.SMS_PROVIDER || "console").toLowerCase();

export async function sendSms(to, body) {
  if (PROVIDER === "twilio") {
    return sendTwilioSms(to, body);
  }

  // Default / development: log the OTP so engineers can test without SMS credits.
  console.log(`[SMS] to=${to} body="${body}"`);
  return { provider: "console" };
}

async function sendTwilioSms(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Twilio is configured as SMS_PROVIDER but TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER is missing",
    );
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams();
  params.append("To", to);
  params.append("From", from);
  params.append("Body", body);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.message || `Twilio SMS failed with status ${response.status}`,
    );
  }

  return { provider: "twilio", sid: data.sid };
}
