import { describe, it, expect } from 'vitest';
import { isBot, getBotName } from '../src/lib/isBot.js';

describe('isBot', () => {
  describe('Social media crawlers', () => {
    it('should detect LinkedInBot', () => {
      const ua = 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect Twitterbot', () => {
      const ua = 'Twitterbot/1.0';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect Facebook crawler', () => {
      const ua = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect Slackbot', () => {
      const ua = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect Discordbot', () => {
      const ua = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect WhatsApp', () => {
      const ua = 'WhatsApp/2.23.10.79 A';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect TelegramBot', () => {
      const ua = 'TelegramBot (like TwitterBot)';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect Pinterest', () => {
      const ua = 'Pinterest/0.2 (+https://www.pinterest.com/bot.html)';
      expect(isBot(ua)).toBe(true);
    });
  });

  describe('Apple crawlers', () => {
    it('should detect Applebot', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect iMessage link previews', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0 iMessageLinkPreviews/1.0';
      expect(isBot(ua)).toBe(true);
    });
  });

  describe('Search engine crawlers', () => {
    it('should detect Googlebot', () => {
      const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect Bingbot', () => {
      const ua = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';
      expect(isBot(ua)).toBe(true);
    });
  });

  describe('HTTP clients', () => {
    it('should detect curl', () => {
      const ua = 'curl/7.64.1';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect wget', () => {
      const ua = 'Wget/1.21';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect Python requests', () => {
      const ua = 'python-requests/2.25.1';
      expect(isBot(ua)).toBe(true);
    });

    it('should detect Postman', () => {
      const ua = 'PostmanRuntime/7.29.0';
      expect(isBot(ua)).toBe(true);
    });
  });

  describe('Human browsers', () => {
    it('should not detect Chrome as bot', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';
      expect(isBot(ua)).toBe(false);
    });

    it('should not detect Safari as bot', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15';
      expect(isBot(ua)).toBe(false);
    });

    it('should not detect Firefox as bot', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0';
      expect(isBot(ua)).toBe(false);
    });

    it('should not detect mobile Safari as bot', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
      expect(isBot(ua)).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should return true for undefined user agent', () => {
      expect(isBot(undefined)).toBe(true);
    });

    it('should return false for random string', () => {
      expect(isBot('Some random string')).toBe(false);
    });
  });
});

describe('getBotName', () => {
  it('should return LinkedIn for LinkedInBot', () => {
    expect(getBotName('LinkedInBot/1.0')).toBe('LinkedIn');
  });

  it('should return Twitter for Twitterbot', () => {
    expect(getBotName('Twitterbot/1.0')).toBe('Twitter');
  });

  it('should return Facebook for facebookexternalhit', () => {
    expect(getBotName('facebookexternalhit/1.1')).toBe('Facebook');
  });

  it('should return null for regular browser', () => {
    expect(getBotName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/112.0.0.0')).toBe(null);
  });

  it('should return null for undefined', () => {
    expect(getBotName(undefined)).toBe(null);
  });
});
