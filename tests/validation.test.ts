import { describe, it, expect } from 'vitest';
import {
  slugSchema,
  phoneSchema,
  redirectQuerySchema,
  linkSchema,
  generateSlug,
  validateAndSanitizeUrl,
} from '../src/lib/validation.js';

describe('slugSchema', () => {
  it('should accept valid slugs', () => {
    expect(slugSchema.safeParse('my-campaign').success).toBe(true);
    expect(slugSchema.safeParse('campaign_2024').success).toBe(true);
    expect(slugSchema.safeParse('Test123').success).toBe(true);
  });

  it('should reject empty slugs', () => {
    expect(slugSchema.safeParse('').success).toBe(false);
  });

  it('should reject slugs with spaces', () => {
    expect(slugSchema.safeParse('my campaign').success).toBe(false);
  });

  it('should reject slugs with special characters', () => {
    expect(slugSchema.safeParse('my@campaign').success).toBe(false);
    expect(slugSchema.safeParse('my/campaign').success).toBe(false);
  });

  it('should reject slugs over 100 characters', () => {
    const longSlug = 'a'.repeat(101);
    expect(slugSchema.safeParse(longSlug).success).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('should accept valid phone numbers', () => {
    const result = phoneSchema.safeParse('12345678900');
    expect(result.success).toBe(true);
  });

  it('should clean and accept formatted numbers', () => {
    const result = phoneSchema.safeParse('+1 (234) 567-8900');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('12345678900');
    }
  });

  it('should reject too short numbers', () => {
    const result = phoneSchema.safeParse('123456');
    expect(result.success).toBe(false);
  });

  it('should reject empty numbers', () => {
    const result = phoneSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('redirectQuerySchema', () => {
  it('should accept empty query', () => {
    const result = redirectQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid query params', () => {
    const result = redirectQuerySchema.safeParse({
      phone: '12345678900',
      text: 'Hello',
      utm_source: 'test',
    });
    expect(result.success).toBe(true);
  });

  it('should accept force param', () => {
    const result = redirectQuerySchema.safeParse({ force: '1' });
    expect(result.success).toBe(true);
  });

  it('should pass through unknown utm params', () => {
    const result = redirectQuerySchema.safeParse({
      utm_custom: 'value',
    });
    expect(result.success).toBe(true);
  });
});

describe('linkSchema', () => {
  const validLink = {
    slug: 'test-campaign',
    campaignName: 'Test Campaign',
    defaultPhone: '12345678900',
    defaultText: 'Hello',
    isActive: true,
  };

  it('should accept valid link data', () => {
    const result = linkSchema.safeParse(validLink);
    expect(result.success).toBe(true);
  });

  it('should accept link with OG fields', () => {
    const result = linkSchema.safeParse({
      ...validLink,
      ogTitle: 'My Title',
      ogDescription: 'My Description',
      ogImage: 'https://example.com/image.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = linkSchema.safeParse({
      slug: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('should accept empty ogImage', () => {
    const result = linkSchema.safeParse({
      ...validLink,
      ogImage: '',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid ogImage URL', () => {
    const result = linkSchema.safeParse({
      ...validLink,
      ogImage: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('generateSlug', () => {
  it('should convert to lowercase', () => {
    expect(generateSlug('My Campaign')).toBe('my-campaign');
  });

  it('should replace spaces with hyphens', () => {
    expect(generateSlug('summer sale 2024')).toBe('summer-sale-2024');
  });

  it('should remove special characters', () => {
    expect(generateSlug('Campaign! @2024')).toBe('campaign-2024');
  });

  it('should trim leading/trailing hyphens', () => {
    expect(generateSlug('---test---')).toBe('test');
  });

  it('should truncate long names', () => {
    const longName = 'a'.repeat(100);
    expect(generateSlug(longName).length).toBeLessThanOrEqual(50);
  });
});

describe('validateAndSanitizeUrl', () => {
  it('should accept valid https URL', () => {
    expect(validateAndSanitizeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('should accept valid http URL', () => {
    expect(validateAndSanitizeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('should reject javascript: URLs', () => {
    expect(validateAndSanitizeUrl('javascript:alert(1)')).toBe(null);
  });

  it('should reject data: URLs', () => {
    expect(validateAndSanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe(null);
  });

  it('should return null for invalid URLs', () => {
    expect(validateAndSanitizeUrl('not-a-url')).toBe(null);
  });
});
