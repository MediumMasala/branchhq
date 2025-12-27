import type { Link } from '@prisma/client';
import {
  getActivePhonesForLink,
  incrementRotationCounter,
  incrementPhoneStats,
} from '../db/phones.js';

export interface PhoneSelectionResult {
  phone: string;
  phoneId: string | null;
  source: 'rotation' | 'default';
}

export interface PhoneSelectionContext {
  link: Link;
  isBot: boolean;
}

/**
 * Main phone selection function
 * Uses simple round-robin for equal distribution across all active phones
 */
export async function selectPhoneForClick(
  ctx: PhoneSelectionContext
): Promise<PhoneSelectionResult> {
  const { link, isBot } = ctx;

  // Bots always get defaultPhone (no rotation)
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

  // Increment rotation counter atomically
  const counter = await incrementRotationCounter(link.id);

  // Simple round-robin: pick phone based on counter
  // Counter is 1-based, so we use (counter - 1) % length
  const index = (Number(counter) - 1) % activePhones.length;
  const selectedPhone = activePhones[index];

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
