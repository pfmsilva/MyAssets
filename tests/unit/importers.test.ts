import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { parsePtDate, parsePtNumber } from "@/lib/importers/types";
import { parseDegiroTrades } from "@/lib/importers/degiro-trades";
import { parseBinance } from "@/lib/importers/binance";
import { detectImporter } from "@/lib/importers/detect";

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and commas inside fields", () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
  });
  it("accepts another delimiter and CRLF", () => {
    expect(parseCsv("a;b\r\n1;2", ";")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("Portuguese numbers and dates", () => {
  it("reads 1.234,56 and 1234,56 and plain numbers", () => {
    expect(parsePtNumber("1.234,56")).toBe(1234.56);
    expect(parsePtNumber("1234,56")).toBe(1234.56);
    expect(parsePtNumber("-12,5 €")).toBe(-12.5);
    expect(parsePtNumber(42)).toBe(42);
    expect(parsePtNumber("")).toBeUndefined();
    expect(parsePtNumber("abc")).toBeUndefined();
  });
  it("reads dd-mm-yyyy and dd/mm/yyyy", () => {
    expect(parsePtDate("05-03-2024")).toBe("2024-03-05");
    expect(parsePtDate("5/3/2024 10:30")).toBe("2024-03-05");
    expect(parsePtDate("2024-03-05")).toBeUndefined();
  });
});

const DEGIRO_HEADER = "Data,Hora,Produto,ISIN,Bolsa de referência,Quantidade,Preços,Valor local,Valor em EUR,Taxa de Câmbio,Custos de transação,Total,ID da Ordem";

describe("parseDegiroTrades", () => {
  it("reads purchases (positive) and sales (negative) with fees", () => {
    const csv = [
      DEGIRO_HEADER,
      "02-01-2024,09:00,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,XET,10,100,-1000,-1000,,-2,-1002,aaa",
      "05-02-2024,10:00,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,XET,-4,110,440,440,,-1,439,bbb",
    ].join("\n");
    const r = parseDegiroTrades(csv);
    expect(r.source).toBe("degiro-trades");
    expect(r.trades).toHaveLength(2);
    expect(r.trades![0]).toMatchObject({ date: "2024-01-02", isin: "IE00BK5BQT80", quantity: 10, amountEur: 1000, feeEur: 2 });
    expect(r.trades![1]).toMatchObject({ date: "2024-02-05", quantity: -4, amountEur: 440, feeEur: 1 });
    expect(r.meta.compras).toBe("1");
    expect(r.meta.vendas).toBe("1");
  });
  it("keeps identical rows distinct and stable (partial fills)", () => {
    const row = "02-01-2024,09:00,ETF,IE00BK5BQT80,XET,1,100,-100,-100,,0,-100,same";
    const a = parseDegiroTrades([DEGIRO_HEADER, row, row].join("\n"));
    const b = parseDegiroTrades([DEGIRO_HEADER, row, row].join("\n"));
    const ids = a.trades!.map((t) => t.externalId);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(b.trades!.map((t) => t.externalId));
  });
  it("skips rows without a valid ISIN, with a warning", () => {
    const r = parseDegiroTrades([DEGIRO_HEADER, "02-01-2024,09:00,X,XX,XET,1,100,-100,-100,,0,-100,a", "02-01-2024,09:00,Y,IE00BK5BQT80,XET,1,100,-100,-100,,0,-100,b"].join("\n"));
    expect(r.trades).toHaveLength(1);
    expect(r.warnings.join(" ")).toMatch(/sem ISIN válido/);
  });
  it("fails clearly when columns are missing or nothing is found", () => {
    expect(() => parseDegiroTrades("Data,Produto\n1,2")).toThrow(/faltam colunas/);
    expect(() => parseDegiroTrades(DEGIRO_HEADER)).toThrow(/Nenhuma compra ou venda/);
    expect(() => parseDegiroTrades("")).toThrow();
  });
});

describe("parseBinance", () => {
  it("reads quantity and value in EUR per coin", async () => {
    const csv = ["Codigo_Binance,Quantidade,Valor_Atual_EUR,Valor_Compra_EUR", "BTC,0.5,30000,20000", "ETH,2,5000,4000", "XRP,0,0,0"].join("\n");
    const r = await parseBinance(csv);
    expect(r.positions.map((p) => p.name)).toEqual(expect.arrayContaining(["BTC", "ETH"]));
    expect(r.positions).toHaveLength(2);
    expect(r.balance).toBe(35000);
    const btc = r.positions.find((p) => p.name === "BTC")!;
    expect(btc.valueEur).toBe(30000);
    expect(btc.costEur).toBe(20000);
    expect(btc.isin).toMatch(/^BTC-/);
  });
  it("needs a value or a Yahoo symbol", async () => {
    await expect(parseBinance("Codigo,Quantidade\nBTC,1")).rejects.toThrow(/valor em EUR ou o símbolo/);
  });
});

describe("detectImporter", () => {
  it("recognises CSVs by their header", () => {
    expect(detectImporter("x.csv", buf("Codigo_Binance,Quantidade,Valor_Atual_EUR\nBTC,1,2")).importer).toBe("binance");
    expect(detectImporter("x.csv", buf(DEGIRO_HEADER + "\n")).importer).toBe("degiro-trades");
    expect(detectImporter("x.csv", buf("Type,Product,Started Date,Completed Date,Amount\n")).importer).toBe("revolut");
  });
  it("does not guess the unknown", () => {
    const r = detectImporter("x.csv", buf("foo,bar\n1,2"));
    expect(r.importer).toBeNull();
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(detectImporter("x.docx", buf("")).importer).toBeNull();
  });
  it("PDF means Optimize", () => {
    expect(detectImporter("extrato.pdf", buf("")).importer).toBe("optimize");
  });
});
