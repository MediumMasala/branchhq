import type { Platform } from './platform.js';

export interface WhatsAppParams {
  phone: string;
  text: string;
  utmParams?: Record<string, string>;
}

// Allowed redirect hosts (security whitelist)
const ALLOWED_HOSTS = [
  'wa.me',
  'api.whatsapp.com',
  'web.whatsapp.com',
];

export function isAllowedRedirectHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function cleanPhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  return phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
}

export function buildWhatsAppUrl(params: WhatsAppParams, platform: Platform): string {
  const cleanPhone = cleanPhoneNumber(params.phone);
  const encodedText = encodeURIComponent(params.text);

  switch (platform) {
    case 'ios':
      // iOS: wa.me works well
      return `https://wa.me/${cleanPhone}?text=${encodedText}`;

    case 'desktop':
      // Desktop: WhatsApp Web
      return `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

    case 'android':
      // Android: Use api.whatsapp.com for better intent handling
      return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

    default:
      return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }
}

export function buildAndroidIntentUrl(phone: string, text: string): string {
  const cleanPhone = cleanPhoneNumber(phone);
  const encodedText = encodeURIComponent(text);

  // Android intent:// scheme for WhatsApp
  // This opens WhatsApp directly on Android Chrome
  const fallbackUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  const encodedFallback = encodeURIComponent(fallbackUrl);

  return `intent://send?phone=${cleanPhone}&text=${encodedText}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${encodedFallback};end;`;
}

export function buildAndroidBridgeUrl(
  baseUrl: string,
  slug: string,
  phone: string,
  text: string,
  utmParams?: Record<string, string>
): string {
  const params = new URLSearchParams();
  params.set('phone', phone);
  params.set('text', text);

  if (utmParams) {
    for (const [key, value] of Object.entries(utmParams)) {
      if (value) {
        params.set(key, value);
      }
    }
  }

  return `${baseUrl}/a/${slug}?${params.toString()}`;
}

export function extractUtmParams(query: Record<string, unknown>): Record<string, string> {
  const utmParams: Record<string, string> = {};
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  for (const key of utmKeys) {
    if (typeof query[key] === 'string' && query[key]) {
      utmParams[key] = query[key] as string;
    }
  }

  // Also capture any other utm_* params
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('utm_') && typeof value === 'string' && value) {
      utmParams[key] = value;
    }
  }

  return utmParams;
}

export function appendUtmToText(text: string, _utmParams: Record<string, string>): string {
  // UTM params are typically for tracking, not for message text
  // But if you want to include them, you could append them
  // For now, we just return the original text
  return text;
}
