import { describe, it, expect } from 'vitest';
import { detectPlatform, isMobile } from '../src/lib/platform.js';

describe('detectPlatform', () => {
  describe('iOS detection', () => {
    it('should detect iPhone', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
      expect(detectPlatform(ua)).toBe('ios');
    });

    it('should detect iPad', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
      expect(detectPlatform(ua)).toBe('ios');
    });

    it('should detect iPod', () => {
      const ua = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
      expect(detectPlatform(ua)).toBe('ios');
    });
  });

  describe('Android detection', () => {
    it('should detect Android phone', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';
      expect(detectPlatform(ua)).toBe('android');
    });

    it('should detect Android tablet', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 12; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';
      expect(detectPlatform(ua)).toBe('android');
    });
  });

  describe('Desktop detection', () => {
    it('should detect Chrome on Windows', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';
      expect(detectPlatform(ua)).toBe('desktop');
    });

    it('should detect Safari on macOS', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15';
      expect(detectPlatform(ua)).toBe('desktop');
    });

    it('should detect Firefox on Linux', () => {
      const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0';
      expect(detectPlatform(ua)).toBe('desktop');
    });
  });

  describe('Edge cases', () => {
    it('should return desktop for undefined user agent', () => {
      expect(detectPlatform(undefined)).toBe('desktop');
    });

    it('should return desktop for empty user agent', () => {
      expect(detectPlatform('')).toBe('desktop');
    });
  });
});

describe('isMobile', () => {
  it('should return true for iOS', () => {
    expect(isMobile('ios')).toBe(true);
  });

  it('should return true for Android', () => {
    expect(isMobile('android')).toBe(true);
  });

  it('should return false for desktop', () => {
    expect(isMobile('desktop')).toBe(false);
  });
});
