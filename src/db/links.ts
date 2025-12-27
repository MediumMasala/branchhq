import prisma from './client.js';
import type { LinkInput, LinkUpdateInput } from '../lib/validation.js';

export async function getLinkBySlug(slug: string) {
  return prisma.link.findUnique({
    where: { slug },
    include: { stats: true },
  });
}

export async function getActiveLink(slug: string) {
  return prisma.link.findFirst({
    where: { slug, isActive: true },
    include: { stats: true },
  });
}

export async function getAllLinks() {
  return prisma.link.findMany({
    include: { stats: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createLink(data: LinkInput) {
  return prisma.$transaction(async (tx) => {
    const link = await tx.link.create({
      data: {
        slug: data.slug,
        campaignName: data.campaignName,
        defaultPhone: data.defaultPhone,
        defaultText: data.defaultText || '',
        isActive: data.isActive ?? true,
        ogTitle: data.ogTitle || null,
        ogDescription: data.ogDescription || null,
        ogImage: data.ogImage || null,
      },
    });

    // Create initial stats record
    await tx.linkStats.create({
      data: {
        linkId: link.id,
        totalClicks: 0,
        humanClicks: 0,
        iosClicks: 0,
        androidClicks: 0,
        desktopClicks: 0,
      },
    });

    return link;
  });
}

export async function updateLink(slug: string, data: LinkUpdateInput) {
  return prisma.link.update({
    where: { slug },
    data: {
      ...(data.slug && { slug: data.slug }),
      ...(data.campaignName && { campaignName: data.campaignName }),
      ...(data.defaultPhone && { defaultPhone: data.defaultPhone }),
      ...(data.defaultText !== undefined && { defaultText: data.defaultText }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.ogTitle !== undefined && { ogTitle: data.ogTitle || null }),
      ...(data.ogDescription !== undefined && { ogDescription: data.ogDescription || null }),
      ...(data.ogImage !== undefined && { ogImage: data.ogImage || null }),
    },
  });
}

export async function deleteLink(slug: string) {
  return prisma.link.delete({
    where: { slug },
  });
}

export async function deactivateLink(slug: string) {
  return prisma.link.update({
    where: { slug },
    data: { isActive: false },
  });
}

export async function slugExists(slug: string): Promise<boolean> {
  const link = await prisma.link.findUnique({
    where: { slug },
    select: { id: true },
  });
  return !!link;
}
