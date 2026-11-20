import { describe, expect, it } from "vitest";
import { reverseLedgerEntry, sumLedger, type LedgerMovement } from "../src/shared/ledger.js";

const movement = (values: Partial<LedgerMovement> & Pick<LedgerMovement, "id" | "type" | "coinDelta" | "scrapDelta">): LedgerMovement => ({
  gameMode: "regular",
  refId: null,
  reversesId: null,
  note: null,
  ...values,
});

describe("append-only ledger", () => {
  it("balances the account by appending reversals instead of mutating the source entries", () => {
    const xp = movement({ id: "xp-1", type: "xp_entry", coinDelta: 500, scrapDelta: 0 });
    const pack = movement({ id: "pack-1", type: "pack_purchase", coinDelta: -250, scrapDelta: 0, refId: "open-1" });
    const scrap = movement({ id: "scrap-1", type: "scrap_gain", coinDelta: 0, scrapDelta: 4, refId: "open-1" });
    const entries = [xp, pack, scrap];
    const reversals = entries.map((entry) => reverseLedgerEntry(entry, `Undo ${entry.id}`));

    expect(sumLedger([...entries, ...reversals])).toEqual({ coins: 0, scrap: 0 });
    expect(entries).toEqual([xp, pack, scrap]);
    expect(reversals.map((entry) => entry.reversesId)).toEqual(["xp-1", "pack-1", "scrap-1"]);
  });
});
