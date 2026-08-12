import { config } from '../../config';
import { logger } from '../../logger';
import type { ExotelConnectResponse } from './types';

export function normalizeExotelPhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+91')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
}

export async function makeExotelConnectCall(params: {
  agentPhone: string;
  customerPhone: string;
  callbackUrl?: string;
  customField?: string;
}): Promise<{ sid: string; status: string }> {
  const { accountSid, apiKey, apiToken, subdomain, exophone, appId, mode } = config.telephony;

  const from = normalizeExotelPhone(params.agentPhone);
  const to = normalizeExotelPhone(params.customerPhone);

  // Trial / Development fallback if API credentials are not set
  if (!accountSid || !apiKey || !apiToken) {
    logger.warn('Exotel API credentials unconfigured in .env. Running in simulated Telephony mode.');
    const mockSid = `mock_c2c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return { sid: mockSid, status: 'Initiated' };
  }

  const baseUrl = subdomain.startsWith('http') ? subdomain : `https://${subdomain}`;
  const url = `${baseUrl}/v1/Accounts/${accountSid}/Calls/connect.json`;

  const body = new URLSearchParams();
  body.append('From', from);
  body.append('To', to);

  if (exophone) {
    body.append('CallerId', exophone);
  }
  if (appId) {
    body.append('Url', `http://my.exotel.com/${accountSid}/exoml/start_voice/${appId}`);
  }
  if (params.callbackUrl) {
    body.append('StatusCallback', params.callbackUrl);
    body.append('StatusCallbackEvents[]', 'terminal');
    body.append('StatusCallbackEvents[]', 'answered');
  }
  if (params.customField) {
    body.append('CustomField', params.customField);
  }
  body.append('Record', 'true');

  const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiToken}`).toString('base64');

  logger.info(`Initiating Exotel Call: From=${from}, To=${to}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = (await res.json()) as ExotelConnectResponse;

  if (!res.ok || data.RestException) {
    const errorMsg = data.RestException?.Message || `Exotel API HTTP ${res.status}`;
    logger.error(`Exotel Connect Call failed: ${errorMsg}`);
    throw new Error(`Exotel Call Failed: ${errorMsg}`);
  }

  const sid = data.Call?.Sid ?? `c2c_${Date.now()}`;
  const status = data.Call?.Status ?? 'Initiated';

  return { sid, status };
}

export async function fetchExotelCallDetails(callSid: string): Promise<{
  status?: string;
  durationSec?: number;
  recordingUrl?: string;
} | null> {
  const { accountSid, apiKey, apiToken, subdomain } = config.telephony;
  if (!accountSid || !apiKey || !apiToken || callSid.startsWith('mock_')) {
    return null;
  }

  const baseUrl = subdomain.startsWith('http') ? subdomain : `https://${subdomain}`;
  const url = `${baseUrl}/v1/Accounts/${accountSid}/Calls/${callSid}.json`;
  const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiToken}`).toString('base64');

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': authHeader },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ExotelConnectResponse;
    if (!data.Call) return null;

    return {
      status: data.Call.Status,
      recordingUrl: (data.Call as Record<string, unknown>).RecordingUrl as string | undefined,
    };
  } catch (err) {
    logger.warn(`Failed to reconcile Exotel call details for ${callSid}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
