import { describe, it, expect } from 'vitest';
import {
  stableShuffle,
  selectPhone,
  generateFingerprint,
  generateShuffleSeed,
  getTimeBucket,
  isValidRotationMode,
  type PhoneEntry,
} from '../src/lib/rotation.js';

describe('stableShuffle', () => {
  const items = ['A', 'B', 'C', 'D', 'E'];

  it('returns array of same length', () => {
    const result = stableShuffle(items, 'seed1');
    expect(result).toHaveLength(items.length);
  });

  it('contains all original items', () => {
    const result = stableShuffle(items, 'seed1');
    expect(result.sort()).toEqual(items.sort());
  });

  it('produces same order for same seed', () => {
    const result1 = stableShuffle(items, 'consistent-seed');
    const result2 = stableShuffle(items, 'consistent-seed');
    expect(result1).toEqual(result2);
  });

  it('produces different order for different seeds', () => {
    const result1 = stableShuffle(items, 'seed-A');
    const result2 = stableShuffle(items, 'seed-B');
    expect(result1).not.toEqual(result2);
  });

  it('handles empty array', () => {
    const result = stableShuffle([], 'seed');
    expect(result).toEqual([]);
  });

  it('handles single item array', () => {
    const result = stableShuffle(['A'], 'seed');
    expect(result).toEqual(['A']);
  });
});

describe('selectPhone', () => {
  const phones: PhoneEntry[] = [
    { id: '1', phoneNumber: '+1111', weight: 1 },
    { id: '2', phoneNumber: '+2222', weight: 1 },
    { id: '3', phoneNumber: '+3333', weight: 1 },
  ];

  describe('ROUND_ROBIN_SHUFFLED mode', () => {
    it('cycles through phones in shuffled order', () => {
      const seed = 'test-seed';
      const results = [];
      // Counter is 1-based (counter-1 is used as index)
      for (let i = 1; i <= 6; i++) {
        const phone = selectPhone(phones, i, 'ROUND_ROBIN_SHUFFLED', seed);
        results.push(phone?.phoneNumber);
      }
      // Should complete 2 full cycles
      expect(results.slice(0, 3).sort()).toEqual(['+1111', '+2222', '+3333']);
      expect(results.slice(3, 6).sort()).toEqual(['+1111', '+2222', '+3333']);
    });

    it('returns same phone for same counter and seed', () => {
      const seed = 'stable-seed';
      const result1 = selectPhone(phones, 5, 'ROUND_ROBIN_SHUFFLED', seed);
      const result2 = selectPhone(phones, 5, 'ROUND_ROBIN_SHUFFLED', seed);
      expect(result1?.id).toEqual(result2?.id);
    });
  });

  describe('RANDOM_NO_REPEAT_EPOCH mode', () => {
    it('cycles through phones without repeating in same epoch', () => {
      const seed = 'epoch-seed';
      const results = [];
      // Counter is 1-based
      for (let i = 1; i <= 3; i++) {
        const phone = selectPhone(phones, i, 'RANDOM_NO_REPEAT_EPOCH', seed);
        results.push(phone?.phoneNumber);
      }
      // All phones should appear exactly once in a cycle
      expect(results.sort()).toEqual(['+1111', '+2222', '+3333']);
    });
  });

  describe('WEIGHTED mode', () => {
    it('falls back to round-robin when all weights equal (stub implementation)', () => {
      const result = selectPhone(phones, 1, 'WEIGHTED', 'seed');
      expect(result).toBeDefined();
      expect(phones.some(p => p.id === result?.id)).toBe(true);
    });
  });

  it('returns null for empty phones array', () => {
    const result = selectPhone([], 0, 'ROUND_ROBIN_SHUFFLED', 'seed');
    expect(result).toBeNull();
  });
});

describe('generateFingerprint', () => {
  it('generates consistent hash for same inputs', () => {
    const fp1 = generateFingerprint('1.2.3.4', 'Mozilla/5.0', 'link-123', 'salt');
    const fp2 = generateFingerprint('1.2.3.4', 'Mozilla/5.0', 'link-123', 'salt');
    expect(fp1).toEqual(fp2);
  });

  it('generates different hash for different IPs', () => {
    const fp1 = generateFingerprint('1.2.3.4', 'Mozilla/5.0', 'link-123', 'salt');
    const fp2 = generateFingerprint('5.6.7.8', 'Mozilla/5.0', 'link-123', 'salt');
    expect(fp1).not.toEqual(fp2);
  });

  it('generates different hash for different user agents', () => {
    const fp1 = generateFingerprint('1.2.3.4', 'Mozilla/5.0', 'link-123', 'salt');
    const fp2 = generateFingerprint('1.2.3.4', 'Safari/5.0', 'link-123', 'salt');
    expect(fp1).not.toEqual(fp2);
  });

  it('generates different hash for different link IDs', () => {
    const fp1 = generateFingerprint('1.2.3.4', 'Mozilla/5.0', 'link-A', 'salt');
    const fp2 = generateFingerprint('1.2.3.4', 'Mozilla/5.0', 'link-B', 'salt');
    expect(fp1).not.toEqual(fp2);
  });

  it('generates different hash for different salts', () => {
    const fp1 = generateFingerprint('1.2.3.4', 'Mozilla/5.0', 'link-123', 'salt1');
    const fp2 = generateFingerprint('1.2.3.4', 'Mozilla/5.0', 'link-123', 'salt2');
    expect(fp1).not.toEqual(fp2);
  });

  it('returns a 64-character hex string (SHA-256)', () => {
    const fp = generateFingerprint('1.2.3.4', 'Mozilla/5.0', 'link-123', 'salt');
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('generateShuffleSeed', () => {
  it('generates consistent seed for same inputs', () => {
    const seed1 = generateShuffleSeed('link-123', 'bucket1', 'secret');
    const seed2 = generateShuffleSeed('link-123', 'bucket1', 'secret');
    expect(seed1).toEqual(seed2);
  });

  it('generates different seed for different link IDs', () => {
    const seed1 = generateShuffleSeed('link-A', 'bucket1', 'secret');
    const seed2 = generateShuffleSeed('link-B', 'bucket1', 'secret');
    expect(seed1).not.toEqual(seed2);
  });

  it('generates different seed for different time buckets', () => {
    const seed1 = generateShuffleSeed('link-123', '2024-01-01', 'secret');
    const seed2 = generateShuffleSeed('link-123', '2024-01-02', 'secret');
    expect(seed1).not.toEqual(seed2);
  });
});

describe('getTimeBucket', () => {
  it('returns YYYY-MM-DD format for day bucket', () => {
    const bucket = getTimeBucket('day');
    expect(bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns consistent value within same day', () => {
    const bucket1 = getTimeBucket('day');
    const bucket2 = getTimeBucket('day');
    expect(bucket1).toEqual(bucket2);
  });
});

describe('isValidRotationMode', () => {
  it('returns true for valid modes', () => {
    expect(isValidRotationMode('ROUND_ROBIN_SHUFFLED')).toBe(true);
    expect(isValidRotationMode('RANDOM_NO_REPEAT_EPOCH')).toBe(true);
    expect(isValidRotationMode('WEIGHTED')).toBe(true);
  });

  it('returns false for invalid modes', () => {
    expect(isValidRotationMode('INVALID')).toBe(false);
    expect(isValidRotationMode('')).toBe(false);
    expect(isValidRotationMode('round_robin')).toBe(false);
  });
});
