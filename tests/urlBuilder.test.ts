import { describe, it, expect } from 'vitest';
import {
  cleanPhoneNumber,
  buildWhatsAppUrl,
  buildAndroidIntentUrl,
  buildAndroidBridgeUrl,
  extractUtmParams,
  isAllowedRedirectHost,
} from '../src/lib/urlBuilder.js';

describe('cleanPhoneNumber', () => {
  it('should remove spaces', () => {
    expect(cleanPhoneNumber('1 234 567 8900')).toBe('12345678900');
  });

  it('should remove dashes', () => {
    expect(cleanPhoneNumber('1-234-567-8900')).toBe('12345678900');
  });

  it('should remove parentheses', () => {
    expect(cleanPhoneNumber('(234) 567-8900')).toBe('2345678900');
  });

  it('should remove leading plus', () => {
    expect(cleanPhoneNumber('+12345678900')).toBe('12345678900');
  });

  it('should keep just digits', () => {
    expect(cleanPhoneNumber('+1 (234) 567-8900')).toBe('12345678900');
  });
});

describe('buildWhatsAppUrl', () => {
  const baseParams = { phone: '12345678900', text: 'Hello World' };

  describe('iOS', () => {
    it('should use wa.me', () => {
      const url = buildWhatsAppUrl(baseParams, 'ios');
      expect(url).toBe('https://wa.me/12345678900?text=Hello%20World');
    });

    it('should encode special characters in text', () => {
      const url = buildWhatsAppUrl({ phone: '12345678900', text: 'Hello & Goodbye!' }, 'ios');
      expect(url).toBe('https://wa.me/12345678900?text=Hello%20%26%20Goodbye!');
    });
  });

  describe('Desktop', () => {
    it('should use web.whatsapp.com', () => {
      const url = buildWhatsAppUrl(baseParams, 'desktop');
      expect(url).toBe('https://web.whatsapp.com/send?phone=12345678900&text=Hello%20World');
    });
  });

  describe('Android', () => {
    it('should use api.whatsapp.com', () => {
      const url = buildWhatsAppUrl(baseParams, 'android');
      expect(url).toBe('https://api.whatsapp.com/send?phone=12345678900&text=Hello%20World');
    });
  });

  it('should clean phone number with special characters', () => {
    const url = buildWhatsAppUrl({ phone: '+1 (234) 567-8900', text: 'Hi' }, 'ios');
    expect(url).toBe('https://wa.me/12345678900?text=Hi');
  });
});

describe('buildAndroidIntentUrl', () => {
  it('should build intent URL with fallback', () => {
    const url = buildAndroidIntentUrl('12345678900', 'Hello');
    expect(url).toContain('intent://send?phone=12345678900');
    expect(url).toContain('scheme=whatsapp');
    expect(url).toContain('package=com.whatsapp');
    expect(url).toContain('S.browser_fallback_url=');
  });
});

describe('buildAndroidBridgeUrl', () => {
  it('should build bridge URL with params', () => {
    const url = buildAndroidBridgeUrl(
      'https://example.com',
      'test-slug',
      '12345678900',
      'Hello World',
      { utm_source: 'test' }
    );
    expect(url).toBe('https://example.com/a/test-slug?phone=12345678900&text=Hello+World&utm_source=test');
  });

  it('should work without UTM params', () => {
    const url = buildAndroidBridgeUrl(
      'https://example.com',
      'test-slug',
      '12345678900',
      'Hello'
    );
    expect(url).toBe('https://example.com/a/test-slug?phone=12345678900&text=Hello');
  });
});

describe('extractUtmParams', () => {
  it('should extract standard UTM params', () => {
    const query = {
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'summer',
      other: 'ignored',
    };
    const result = extractUtmParams(query);
    expect(result).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'summer',
    });
  });

  it('should ignore empty values', () => {
    const query = {
      utm_source: 'google',
      utm_medium: '',
    };
    const result = extractUtmParams(query);
    expect(result).toEqual({
      utm_source: 'google',
    });
  });

  it('should include custom utm_* params', () => {
    const query = {
      utm_source: 'test',
      utm_custom: 'value',
    };
    const result = extractUtmParams(query);
    expect(result).toEqual({
      utm_source: 'test',
      utm_custom: 'value',
    });
  });
});

describe('isAllowedRedirectHost', () => {
  it('should allow wa.me', () => {
    expect(isAllowedRedirectHost('https://wa.me/12345')).toBe(true);
  });

  it('should allow api.whatsapp.com', () => {
    expect(isAllowedRedirectHost('https://api.whatsapp.com/send')).toBe(true);
  });

  it('should allow web.whatsapp.com', () => {
    expect(isAllowedRedirectHost('https://web.whatsapp.com/send')).toBe(true);
  });

  it('should reject other domains', () => {
    expect(isAllowedRedirectHost('https://evil.com/phishing')).toBe(false);
  });

  it('should handle invalid URLs', () => {
    expect(isAllowedRedirectHost('not-a-url')).toBe(false);
  });
});
