import type { Link } from '@prisma/client';
import {
  getActivePhonesForLink,
  getStickyMapping,
  setStickyMapping,
  isPhoneActive,
  incrementRotationCounter,
  incrementPhoneStats,
  cleanupExpiredMappings,
} from '../db/phones.js';
import {
  generateShuffleSeed,
  getTimeBucket,
  selectPhone,
  generateFingerprint,
  type RotationMode,
} from '../lib/rotation.js';

// Environment variables
const ROTATION_SEED_SECRET = process.env.ROTATION_SEED_SECRET || 'default-rotation-secret-change-me';
const STICKY_FINGERPRINT_SALT = process.env.STICKY_FINGERPRINT_SALT || ROTATION_SEED_SECRET;

export interface PhoneSelectionResult {
  phone: string;
  phoneId: string | null;
  source: 'rotation' | 'sticky' | 'default' | 'fallback';
}

export interface PhoneSelectionContext {
  link: Link;
  ip: string;
  userAgent: string;
  isBot: boolean;
}

/**
 * Main phone selection function
 * Handles sticky sessions, rotation, and fallback to defaultPhone
 */
export async function selectPhoneForClick(
  ctx: PhoneSelectionContext
): Promise<PhoneSelectionResult> {
  const { link, ip, userAgent, isBot } = ctx;

  // Bots always get defaultPhone (no rotation, no sticky)
  if (isBot) {
    return {
      phone: link.defaultPhone,
      phoneId: null,
      source: 'default',
    };
  }

  // Get active phones for this campaign
  const activePhones = await getActivePhonesForLink(link.id);

  // If no phones configured, use defaultPhone
  if (activePhones.length === 0) {
    return {
      phone: link.defaultPhone,
      phoneId: null,
      source: 'default',
    };
  }

  // Generate fingerprint for sticky/unique tracking
  const fingerprintHash = generateFingerprint(ip, userAgent, link.id, STICKY_FINGERPRINT_SALT);

  // Check sticky mapping if enabled
  if (link.stickyEnabled) {
    const stickyMapping = await getStickyMapping(link.id, fingerprintHash);

    if (stickyMapping) {
      // Verify the mapped phone is still active
      const phoneStillActive = await isPhoneActive(stickyMapping.phoneId);

      if (phoneStillActive) {
        // Find the phone in our active list
        const stickyPhone = activePhones.find((p) => p.id === stickyMapping.phoneId);
        if (stickyPhone) {
          return {
            phone: stickyPhone.phoneNumber,
            phoneId: stickyPhone.id,
            source: 'sticky',
          };
        }
      }
      // Phone is paused/deleted, proceed to rotation and update sticky
    }
  }

  // Increment rotation counter atomically
  const counter = await incrementRotationCounter(link.id);

  // Generate shuffle seed based on rotation mode
  const rotationMode = link.rotationMode as RotationMode;
  let shuffleSeed: string;

  if (rotationMode === 'RANDOM_NO_REPEAT_EPOCH') {
    // Epoch-based: reshuffle daily
    const timeBucket = getTimeBucket('day');
    shuffleSeed = generateShuffleSeed(link.id, timeBucket, ROTATION_SEED_SECRET);
  } else {
    // For ROUND_ROBIN_SHUFFLED and WEIGHTED, use a stable seed
    shuffleSeed = generateShuffleSeed(link.id, 'stable', ROTATION_SEED_SECRET);
  }

  // Select phone from pool
  const phoneEntries = activePhones.map((p) => ({
    id: p.id,
    phoneNumber: p.phoneNumber,
    weight: p.weight,
  }));

  const selectedPhone = selectPhone(
    phoneEntries,
    Number(counter),
    rotationMode,
    shuffleSeed
  );

  if (!selectedPhone) {
    // Fallback to defaultPhone if rotation fails
    return {
      phone: link.defaultPhone,
      phoneId: null,
      source: 'fallback',
    };
  }

  // Update sticky mapping if enabled
  if (link.stickyEnabled) {
    try {
      await setStickyMapping(
        link.id,
        fingerprintHash,
        selectedPhone.id,
        link.stickyTtlHours
      );
    } catch (err) {
      // Non-critical, log but don't fail
      console.error('Failed to set sticky mapping:', err);
    }
  }

  // Opportunistically clean up expired mappings (1% of requests)
  if (Math.random() < 0.01) {
    cleanupExpiredMappings().catch((err) => {
      console.error('Failed to cleanup expired mappings:', err);
    });
  }

  return {
    phone: selectedPhone.phoneNumber,
    phoneId: selectedPhone.id,
    source: 'rotation',
  };
}

/**
 * Record phone click stats (call after successful redirect)
 */
export async function recordPhoneClick(phoneId: string | null): Promise<void> {
  if (!phoneId) return;

  try {
    await incrementPhoneStats(phoneId);
  } catch (err) {
    console.error('Failed to record phone click:', err);
  }
}
