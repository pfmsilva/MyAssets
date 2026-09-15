import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "../src/lib/db-url";
import { runSeed } from "../src/lib/seed";

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });

runSeed(prisma)
  .then((r) => console.log("Seed concluído:", r))
  .finally(() => prisma.$disconnect());
