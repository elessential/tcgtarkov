export interface LedgerMovement {
  id: string;
  type: string;
  gameMode: string;
  coinDelta: number;
  scrapDelta: number;
  refId: string | null;
  reversesId: string | null;
  note: string | null;
}

export function reverseLedgerEntry(entry: LedgerMovement, note: string) {
  return {
    type: "reversal",
    gameMode: entry.gameMode,
    coinDelta: -entry.coinDelta,
    scrapDelta: -entry.scrapDelta,
    reversesId: entry.id,
    refId: entry.refId,
    note,
  };
}

export function sumLedger(entries: ReadonlyArray<Pick<LedgerMovement, "coinDelta" | "scrapDelta">>) {
  return entries.reduce(
    (balance, entry) => ({
      coins: balance.coins + entry.coinDelta,
      scrap: balance.scrap + entry.scrapDelta,
    }),
    { coins: 0, scrap: 0 },
  );
}
