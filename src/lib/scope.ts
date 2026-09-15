import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "./prisma";

/**
 * What a user may see. Administrators see everything. Other users see only the assets owned
 * (in any percentage) by the family members linked to them; with no linked members they see everything.
 */
export type Scope = { all: true; memberIds?: undefined; assetIds?: undefined } | { all: false; memberIds: string[]; assetIds: string[] };

export async function getScope(user: { id: string; role: Role }): Promise<Scope> {
  if (user.role === "ADMIN") return { all: true };
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { visibleMembers: { select: { id: true } } } });
  const memberIds = u?.visibleMembers.map((m) => m.id) ?? [];
  if (!memberIds.length) return { all: true };
  const assets = await prisma.asset.findMany({ where: { ownerships: { some: { memberId: { in: memberIds } } } }, select: { id: true } });
  return { all: false, memberIds, assetIds: assets.map((a) => a.id) };
}

export const canSeeAsset = (scope: Scope, assetId: string) => scope.all || scope.assetIds.includes(assetId);
export const canSeeMember = (scope: Scope, memberId: string) => scope.all || scope.memberIds.includes(memberId);

export function assertAssetVisible(scope: Scope, assetId: string) {
  if (!canSeeAsset(scope, assetId)) notFound();
}

/** Prisma `where` fragment for assets in scope. */
export const assetScopeWhere = (scope: Scope) => (scope.all ? {} : { id: { in: scope.assetIds } });
/** Prisma `where` fragment for rows with an `assetId` column. */
export const assetIdScopeWhere = (scope: Scope) => (scope.all ? {} : { assetId: { in: scope.assetIds } });
/** Prisma `where` fragment for members in scope. */
export const memberScopeWhere = (scope: Scope) => (scope.all ? {} : { id: { in: scope.memberIds } });
