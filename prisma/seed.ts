import { PrismaClient, CategoryKind } from "@prisma/client";
import { resolveDatabaseUrl } from "../src/lib/db-url";

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });

const MEMBERS = [
  { name: "Paulo", color: "#2a78d6" },
  { name: "Cônjuge", color: "#eb6834" },
  { name: "Filho 1", color: "#1baf7a" },
  { name: "Filho 2", color: "#eda100" },
  { name: "Filho 3", color: "#e87ba4" },
];

const CATEGORIES: { name: string; kind: CategoryKind; color: string; rules: string[] }[] = [
  { name: "Salário", kind: "INCOME", color: "#008300", rules: ["VENCIMENTO", "ORDENADO", "SALARIO", "SALÁRIO", "REMUNERACAO"] },
  { name: "Outros rendimentos", kind: "INCOME", color: "#1baf7a", rules: ["JUROS", "DIVIDENDO", "REEMBOLSO IRS", "SEG SOCIAL", "ABONO"] },
  { name: "Reembolsos", kind: "EXPENSE", color: "#4a3aa7", rules: ["DEV. COMPRA", "Devolução"] },
  { name: "Supermercado", kind: "EXPENSE", color: "#2a78d6", rules: ["CONTINENTE", "PINGO DOCE", "AUCHAN", "LIDL", "MINIPRECO", "MINIPREÇO", "INTERMARCHE", "MERCADONA", "ALDI", "EL CORTE INGLES", "El Corte Inglés"] },
  { name: "Restauração", kind: "EXPENSE", color: "#eb6834", rules: ["McDonald", "BURGER", "PIZZA", "RESTAURANTE", "CAFE ", "PASTELARIA", "Starbucks", "Uber Eats", "Glovo", "Bolt Food", "GERTAL", "CANTINHO"] },
  { name: "Combustível & transportes", kind: "EXPENSE", color: "#eda100", rules: ["GALP", "REPSOL", "BP ", "CEPSA", "PRIO", "VIA VERDE", "BRISA", "CP ", "METRO", "CARRIS", "Uber", "Bolt", "Ryanair", "TAP ", "EASYJET", "ESTACIONAMENTO", "EMEL"] },
  { name: "Casa & utilidades", kind: "EXPENSE", color: "#1baf7a", rules: ["EDP", "GALP ENERGIA", "GOLDENERGY", "IBERDROLA", "ENDESA", "EPAL", "AGUAS", "ÁGUAS", "CONDOMINIO", "CONDOMÍNIO", "RENDA", "IKEA", "LEROY", "AKI "] },
  { name: "Telecomunicações & subscrições", kind: "EXPENSE", color: "#4a3aa7", rules: ["MEO", "NOS ", "VODAFONE", "NOWO", "Netflix", "Spotify", "Apple", "Google", "Amazon Prime", "Disney", "HBO", "YouTube", "Microsoft"] },
  { name: "Saúde", kind: "EXPENSE", color: "#e34948", rules: ["FARMACIA", "FARMÁCIA", "CLINICA", "CLÍNICA", "HOSPITAL", "MEDIS", "MULTICARE", "DENTISTA", "OPTICA", "ÓPTICA", "WELLS"] },
  { name: "Educação & filhos", kind: "EXPENSE", color: "#e87ba4", rules: ["ESCOLA", "COLEGIO", "COLÉGIO", "UNIVERSIDADE", "EXPLICA", "LIVRARIA", "BERTRAND", "FNAC", "ATL "] },
  { name: "Compras & lazer", kind: "EXPENSE", color: "#eda100", rules: ["Worten", "AMAZON", "ZARA", "H&M", "DECATHLON", "PRIMARK", "SPORT ZONE", "CINEMA", "NOS LUSOMUNDO", "STEAM", "PlayStation", "Nintendo"] },
  { name: "Seguros & impostos", kind: "EXPENSE", color: "#e34948", rules: ["SEGURO", "FIDELIDADE", "TRANQUILIDADE", "ALLIANZ", "AGEAS", "AUTORIDADE TRIBUTARIA", "AT -", "IMPOSTO", "IUC", "IMI "] },
  { name: "Comissões bancárias", kind: "EXPENSE", color: "#52514e", rules: ["COMISSAO", "COMISSÃO", "IMPOSTO SELO", "Taxa", "MANUTENCAO CONTA", "ANUIDADE"] },
  { name: "Levantamentos", kind: "TRANSFER", color: "#52514e", rules: ["LEV. ATM", "Levantamento de numerário", "LEVANTAMENTO"] },
  { name: "Transferências internas", kind: "TRANSFER", color: "#86b6ef", rules: ["Revolut", "Carregamento com cartão", "TRANSACAO AFT", "Transferência de PAULO", "Transferência para PAULO"] },
  { name: "Transferências", kind: "TRANSFER", color: "#9ec5f4", rules: ["TRF SEPA", "Transferência de", "Transferência para", "MB WAY", "MBWAY"] },
  { name: "Investimentos", kind: "INVESTMENT", color: "#0d366b", rules: ["DEGIRO", "flatex", "XTB", "Binance", "PPR", "OPTIMIZE", "Save and Grow", "Save & Grow"] },
];

async function main() {
  const members: Record<string, string> = {};
  for (const [i, m] of MEMBERS.entries()) {
    const existing = await prisma.member.findFirst({ where: { name: m.name } });
    const row = existing ?? (await prisma.member.create({ data: { ...m, sortOrder: i } }));
    members[m.name] = row.id;
  }

  const ASSETS = [
    { name: "BPI Conta à Ordem", institution: "BPI", type: "CURRENT_ACCOUNT", importer: "bpi", owners: [["Paulo", 50], ["Cônjuge", 50]] },
    { name: "Revolut", institution: "Revolut", type: "CURRENT_ACCOUNT", importer: "revolut", owners: [["Paulo", 100]] },
    { name: "CTT Conta à Ordem", institution: "Banco CTT", type: "CURRENT_ACCOUNT", importer: null, owners: [["Paulo", 100]] },
    { name: "PPR Optimize", institution: "Optimize", type: "PPR", importer: null, owners: [["Paulo", 100]] },
    { name: "PPR Save and Grow", institution: "Save and Grow", type: "PPR", importer: null, owners: [["Cônjuge", 100]] },
    { name: "DEGIRO", institution: "DEGIRO", type: "BROKERAGE", importer: "degiro", owners: [["Paulo", 100]] },
    { name: "XTB", institution: "XTB", type: "BROKERAGE", importer: null, owners: [["Paulo", 100]] },
    { name: "Binance (Bitcoin)", institution: "Binance", type: "CRYPTO", importer: null, owners: [["Paulo", 100]] },
    { name: "Dinheiro em casa", institution: "Casa", type: "CASH", importer: null, owners: [["Paulo", 50], ["Cônjuge", 50]] },
  ] as const;
  for (const [i, a] of ASSETS.entries()) {
    const existing = await prisma.asset.findFirst({ where: { name: a.name } });
    if (existing) continue;
    await prisma.asset.create({
      data: {
        name: a.name,
        institution: a.institution,
        type: a.type,
        importer: a.importer,
        sortOrder: i,
        ownerships: { create: a.owners.map(([m, p]) => ({ memberId: members[m], percent: p })) },
      },
    });
  }

  for (const [i, c] of CATEGORIES.entries()) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      create: { name: c.name, kind: c.kind, color: c.color, sortOrder: i },
      update: {},
    });
    const count = await prisma.categoryRule.count({ where: { categoryId: cat.id } });
    if (count === 0) {
      await prisma.categoryRule.createMany({ data: c.rules.map((pattern) => ({ pattern, categoryId: cat.id, priority: c.kind === "EXPENSE" ? 0 : 10 })) });
    }
  }
  console.log("Seed concluído.");
}

main().finally(() => prisma.$disconnect());
