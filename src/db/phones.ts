import { prisma } from './client.js';
import type { LinkPhone, FingerprintMap } from '@prisma/client';

export interface PhoneWithStats extends LinkPhone {
  percentShare?: number;
}

/**
 * Get all phones for a campaign
 */
export async function getPhonesByLinkId(linkId: string): Promise<LinkPhone[]> {
  return prisma.linkPhone.findMany({
    where: { linkId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Get active phones for a campaign (status = 'ACTIVE')
 */
export async function getActivePhonesForLink(linkId: string): Promise<LinkPhone[]> {
  return prisma.linkPhone.findMany({
    where: {
      linkId,
      status: 'ACTIVE',
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Add a phone to a campaign
 */
export async function addPhone(
  linkId: string,
  phoneNumber: string,
  notes?: string
): Promise<LinkPhone> {
  return prisma.linkPhone.create({
    data: {
      linkId,
      phoneNumber,
      notes,
      status: 'ACTIVE',
      weight: 1,
    },
  });
}

/**
 * Add multiple phones to a campaign
 */
export async function addPhones(
  linkId: string,
  phoneNumbers: string[]
): Promise<number> {
  const result = await prisma.linkPhone.createMany({
    data: phoneNumbers.map((phoneNumber) => ({
      linkId,
      phoneNumber: phoneNumber.trim(),
      status: 'ACTIVE',
      weight: 1,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Update phone status (ACTIVE/PAUSED)
 */
export async function updatePhoneStatus(
  phoneId: string,
  status: 'ACTIVE' | 'PAUSED'
): Promise<LinkPhone> {
  return prisma.linkPhone.update({
    where: { id: phoneId },
    data: { status },
  });
}

/**
 * Delete a phone
 */
export async function deletePhone(phoneId: string): Promise<void> {
  await prisma.linkPhone.delete({
    where: { id: phoneId },
  });
}

/**
 * Increment rotation counter atomically and return new value
 * Uses raw SQL for atomic increment with RETURNING
 */
export async function incrementRotationCounter(linkId: string): Promise<bigint> {
  // First, try to update existing row
  const result = await prisma.$queryRaw<{ counter: bigint }[]>`
    INSERT INTO link_rotation (link_id, counter)
    VALUES (${linkId}::uuid, 1)
    ON CONFLICT (link_id)
    DO UPDATE SET counter = link_rotation.counter + 1
    RETURNING counter
  `;

  return result[0]?.counter ?? BigInt(1);
}

/**
 * Reset rotation counter for a campaign
 */
export async function resetRotationCounter(linkId: string): Promise<void> {
  await prisma.linkRotation.upsert({
    where: { linkId },
    update: { counter: 0 },
    create: { linkId, counter: 0 },
  });
}

/**
 * Get current rotation counter
 */
export async function getRotationCounter(linkId: string): Promise<bigint> {
  const rotation = await prisma.linkRotation.findUnique({
    where: { linkId },
  });
  return rotation?.counter ?? BigInt(0);
}

/**
 * Update shuffle seed (for force reshuffle)
 */
export async function updateShuffleSeed(
  linkId: string,
  seed: string
): Promise<void> {
  await prisma.linkRotation.upsert({
    where: { linkId },
    update: {
      shuffleSeed: seed,
      lastShuffledAt: new Date(),
    },
    create: {
      linkId,
      counter: 0,
      shuffleSeed: seed,
      lastShuffledAt: new Date(),
    },
  });
}

/**
 * Get sticky mapping for a fingerprint
 */
export async function getStickyMapping(
  linkId: string,
  fingerprintHash: string
): Promise<FingerprintMap | null> {
  return prisma.fingerprintMap.findFirst({
    where: {
      linkId,
      fingerprintHash,
      expiresAt: { gt: new Date() },
    },
  });
}

/**
 * Set or update sticky mapping
 */
export async function setStickyMapping(
  linkId: string,
  fingerprintHash: string,
  phoneId: string,
  ttlHours: number
): Promise<FingerprintMap> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  return prisma.fingerprintMap.upsert({
    where: {
      linkId_fingerprintHash: { linkId, fingerprintHash },
    },
    update: {
      phoneId,
      expiresAt,
    },
    create: {
      linkId,
      fingerprintHash,
      phoneId,
      expiresAt,
    },
  });
}

/**
 * Check if phone is still active (for sticky validation)
 */
export async function isPhoneActive(phoneId: string): Promise<boolean> {
  const phone = await prisma.linkPhone.findUnique({
    where: { id: phoneId },
    select: { status: true },
  });
  return phone?.status === 'ACTIVE';
}

/**
 * Increment phone click stats
 */
export async function incrementPhoneStats(phoneId: string): Promise<void> {
  await prisma.linkPhone.update({
    where: { id: phoneId },
    data: {
      totalClicks: { increment: 1 },
      lastClickAt: new Date(),
    },
  });
}

/**
 * Clean up expired fingerprint mappings (call opportunistically)
 */
export async function cleanupExpiredMappings(): Promise<number> {
  const result = await prisma.fingerprintMap.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}

/**
 * Count unique fingerprints for a link in last 24 hours
 */
export async function countUniqueHumans24h(linkId: string): Promise<number> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await prisma.fingerprintMap.count({
    where: {
      linkId,
      createdAt: { gte: twentyFourHoursAgo },
    },
  });

  return result;
}

/**
 * Get phones with calculated percentage share
 */
export async function getPhonesWithStats(linkId: string): Promise<PhoneWithStats[]> {
  const phones = await getPhonesByLinkId(linkId);

  if (phones.length === 0) return [];

  // Calculate total clicks across all phones
  const totalClicks = phones.reduce(
    (sum, p) => sum + Number(p.totalClicks),
    0
  );

  return phones.map((phone) => ({
    ...phone,
    percentShare:
      totalClicks > 0
        ? Math.round((Number(phone.totalClicks) / totalClicks) * 100 * 10) / 10
        : 0,
  }));
}

/**
 * Update link rotation configuration
 */
export async function updateLinkRotationConfig(
  linkId: string,
  config: {
    rotationMode?: string;
    stickyEnabled?: boolean;
    stickyTtlHours?: number;
  }
): Promise<void> {
  await prisma.link.update({
    where: { id: linkId },
    data: config,
  });
}
