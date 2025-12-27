import { createHash } from 'crypto';

export type RotationMode = 'ROUND_ROBIN_SHUFFLED' | 'RANDOM_NO_REPEAT_EPOCH' | 'WEIGHTED';

export interface PhoneEntry {
  id: string;
  phoneNumber: string;
  weight: number;
}

/**
 * Generates a deterministic seed for shuffling based on:
 * - linkId: ensures each campaign has different order
 * - timeBucket: for epoch-based modes (daily/hourly)
 * - secret: prevents prediction
 */
export function generateShuffleSeed(
  linkId: string,
  timeBucket: string,
  secret: string
): string {
  return createHash('sha256')
    .update(`${linkId}:${timeBucket}:${secret}`)
    .digest('hex');
}

/**
 * Gets the current time bucket for epoch-based shuffling
 * Uses daily bucket by default
 */
export function getTimeBucket(mode: 'hour' | 'day' = 'day'): string {
  const now = new Date();
  if (mode === 'hour') {
    return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
  }
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
}

/**
 * Stable shuffle using Fisher-Yates with seeded random
 * Produces the same order for the same seed
 */
export function stableShuffle<T>(items: T[], seed: string): T[] {
  if (items.length <= 1) return [...items];

  // Create a copy to avoid mutating the original
  const result = [...items];

  // Use seed to create deterministic random numbers
  let seedNum = 0;
  for (let i = 0; i < seed.length; i++) {
    seedNum = ((seedNum << 5) - seedNum + seed.charCodeAt(i)) | 0;
  }

  // Seeded random function
  const seededRandom = (): number => {
    seedNum = (seedNum * 1103515245 + 12345) & 0x7fffffff;
    return seedNum / 0x7fffffff;
  };

  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Select a phone from the pool based on rotation mode and counter
 */
export function selectPhone(
  phones: PhoneEntry[],
  counter: number,
  mode: RotationMode,
  shuffleSeed: string
): PhoneEntry | null {
  if (phones.length === 0) return null;
  if (phones.length === 1) return phones[0];

  switch (mode) {
    case 'ROUND_ROBIN_SHUFFLED':
    case 'RANDOM_NO_REPEAT_EPOCH': {
      // Both modes use stable shuffle, difference is in seed generation
      const shuffled = stableShuffle(phones, shuffleSeed);
      const idx = (counter - 1) % shuffled.length;
      return shuffled[idx >= 0 ? idx : 0];
    }

    case 'WEIGHTED': {
      // If all weights are 1, behave like ROUND_ROBIN_SHUFFLED
      const allEqual = phones.every((p) => p.weight === 1);
      if (allEqual) {
        const shuffled = stableShuffle(phones, shuffleSeed);
        const idx = (counter - 1) % shuffled.length;
        return shuffled[idx >= 0 ? idx : 0];
      }

      // Smooth weighted round robin
      // Create expanded list based on weights, then shuffle and pick
      const expanded: PhoneEntry[] = [];
      for (const phone of phones) {
        for (let i = 0; i < phone.weight; i++) {
          expanded.push(phone);
        }
      }
      const shuffled = stableShuffle(expanded, shuffleSeed);
      const idx = (counter - 1) % shuffled.length;
      return shuffled[idx >= 0 ? idx : 0];
    }

    default:
      // Fallback to first phone
      return phones[0];
  }
}

/**
 * Generate fingerprint hash for sticky sessions
 * Uses IP + User-Agent + linkId + salt
 */
export function generateFingerprint(
  ip: string,
  userAgent: string,
  linkId: string,
  salt: string
): string {
  return createHash('sha256')
    .update(`${ip}:${userAgent}:${linkId}:${salt}`)
    .digest('hex');
}

/**
 * Validate rotation mode
 */
export function isValidRotationMode(mode: string): mode is RotationMode {
  return ['ROUND_ROBIN_SHUFFLED', 'RANDOM_NO_REPEAT_EPOCH', 'WEIGHTED'].includes(mode);
}
