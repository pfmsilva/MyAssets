"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/access";
import { canSeeAsset, getScope } from "@/lib/scope";
import { ImportResult, runImport } from "@/lib/import-service";
import { IMPORTERS, ImporterKey } from "@/lib/importers";

export type ImportState = { result?: ImportResult; error?: string };

export async function importFile(_prev: ImportState, fd: FormData): Promise<ImportState> {
  try {
    const user = await assertRole("EDITOR");
    const assetId = String(fd.get("assetId") ?? "");
    const importer = String(fd.get("importer") ?? "") as ImporterKey;
    const file = fd.get("file");
    const snapshotDate = String(fd.get("snapshotDate") ?? "") || undefined;
    if (!assetId) return { error: "Escolha o ativo." };
    if (!canSeeAsset(await getScope(user), assetId)) return { error: "Sem permissão para este ativo." };
    if (!(importer in IMPORTERS)) return { error: "Escolha o tipo de ficheiro." };
    if (!(file instanceof File) || file.size === 0) return { error: "Escolha um ficheiro." };
    if (file.size > 15 * 1024 * 1024) return { error: "Ficheiro demasiado grande (máx. 15 MB)." };
    const result = await runImport({ assetId, importer, fileName: file.name, buffer: await file.arrayBuffer(), snapshotDate, userId: user.id });
    revalidatePath("/", "layout");
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro na importação." };
  }
}

export async function deleteImportBatch(id: string) {
  const user = await assertRole("EDITOR");
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id }, select: { assetId: true } });
  if (!canSeeAsset(await getScope(user), batch.assetId)) throw new Error("Sem permissão para este ativo.");
  await prisma.importBatch.delete({ where: { id } });
  revalidatePath("/", "layout");
}
