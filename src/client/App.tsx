import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ITEM_CLASSES, ITEM_CLASS_IDS, type DrawnCard, type ItemClass, type Rarity, type Trader } from "../shared/game.js";

type Tab = "Packs" | "Collection" | "History & Stats" | "Settings";
interface Item {
  id: string;
  name: string;
  shortName: string;
  trader: Trader;
  loyaltyLevel: number;
  poolKey: string;
  rarity: Rarity;
  wikiUrl: string | null;
  imageLocal: string | null;
  imageUrl: string | null;
  basePrice: number;
  ownedCount: number;
  foilCount: number;
}
interface Pool {
  poolKey: string;
  trader: Trader;
  levelRange: string;
  itemCount: number;
  packPrice: number;
  collectedCount: number;
}
interface LedgerEntry {
  id: string;
  type: string;
  timestamp: string;
  coinDelta: number;
  scrapDelta: number;
  xpAmount: number | null;
  reversesId: string | null;
  note: string | null;
}
interface OpenPack {
  id: string;
  poolKey: string;
  timestamp: string;
  wasGodPack: boolean;
  flipped: boolean;
  cards: DrawnCard[];
}
interface Settings {
  xpPerCoin: number;
  packSize: number;
  rarityWeights: Record<Rarity, number>;
  godPackChance: number;
  foilChance: number;
  newCardPity: number;
  epicPity: number;
  overlayDuration: number;
  overlayMode: "immediate" | "synced";
  overlayHud: boolean;
  overlayPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  gameMode: "regular" | "pve";
  enabledItemClasses: ItemClass[];
}
interface AppState {
  settings: Settings;
  gameMode: string;
  coins: number;
  scrap: number;
  collection: Array<{ item: Item; ownedCount: number; foilCount: number }>;
  packs: OpenPack[];
  ledger: LedgerEntry[];
  pools: Array<Pool>;
  stats: {
    packsOpened: number;
    godPacks: number;
    coinsSpent: number;
    luckiestPack: { id: string; score: number; cards: DrawnCard[] } | null;
    rarestPull: { name: string; rarity: Rarity; packId: string } | null;
    completionHistory: Array<{ timestamp: string; collected: number }>;
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

function App() {
  const [tab, setTab] = useState<Tab>("Packs");
  const [state, setState] = useState<AppState | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [activePool, setActivePool] = useState<string | null>(null);
  const [selectedTrader, setSelectedTrader] = useState<string>("All");
  const [openPack, setOpenPack] = useState<OpenPack | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [xpInput, setXpInput] = useState("");
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [overlaySecret, setOverlaySecret] = useState("");
  const [filters, setFilters] = useState({ trader: "All", level: "All", rarity: "All", status: "All", search: "" });

  const refresh = useCallback(async () => {
    const next = await request<AppState>("/api/state");
    setState(next);
    setActivePool((current) => current && next.pools.some((pool) => pool.poolKey === current) ? current : next.pools[0]?.poolKey ?? null);
    const allItems = await request<Item[]>("/api/items");
    setItems(allItems);
  }, []);

  useEffect(() => {
    void refresh().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load application state."));
  }, [refresh]);

  const active = state?.pools.find((pool) => pool.poolKey === activePool);
  const visiblePools = state?.pools.filter((pool) => selectedTrader === "All" || pool.trader === selectedTrader) ?? [];
  const overlayHudQuery = state?.settings.overlayHud ? "?hud=true" : "";
  const overlayLocalUrl = `http://localhost:5173/overlay${overlayHudQuery}`;
  const distinctOwned = state?.collection.length ?? 0;
  const itemCount = items.length;
  const progress = itemCount === 0 ? 0 : (distinctOwned / itemCount) * 100;
  const traderProgress = useMemo(() => {
    const progressByTrader = new Map<string, { collected: number; total: number }>();
    for (const pool of state?.pools ?? []) {
      const current = progressByTrader.get(pool.trader) ?? { collected: 0, total: 0 };
      current.collected += pool.collectedCount;
      current.total += pool.itemCount;
      progressByTrader.set(pool.trader, current);
    }
    return [...progressByTrader.entries()];
  }, [state?.pools]);

  const filteredItems = useMemo(() => items.filter((item) => {
    if (filters.trader !== "All" && item.trader !== filters.trader) return false;
    if (filters.level !== "All" && item.loyaltyLevel !== Number(filters.level)) return false;
    if (filters.rarity !== "All" && item.rarity !== filters.rarity) return false;
    if (filters.status === "Unlocked" && item.ownedCount === 0) return false;
    if (filters.status === "Missing" && item.ownedCount > 0) return false;
    return item.name.toLowerCase().includes(filters.search.toLowerCase());
  }), [filters, items]);

  const run = async (action: () => Promise<void>) => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const addXp = (amount: number) => run(async () => {
    const result = await request<{ earned: number }>("/api/xp", { method: "POST", body: JSON.stringify({ xpAmount: amount }) });
    setSuccess(`+${result.earned.toLocaleString()} coins added.`);
    setXpInput("");
    await refresh();
  });

  const buyPack = () => {
    if (!active) return;
    void run(async () => {
      const result = await request<{ pack: OpenPack }>("/api/packs/open", {
        method: "POST",
        body: JSON.stringify({ poolKey: active.poolKey, idempotencyKey: crypto.randomUUID() }),
      });
      if (skipAnimation && state?.settings.overlayMode === "synced") {
        await request(`/api/packs/${result.pack.id}/flip`, { method: "POST", body: JSON.stringify({ all: true }) });
      }
      setOpenPack(result.pack);
      setRevealed(skipAnimation ? new Set(result.pack.cards.map((_, index) => index)) : new Set());
      await refresh();
    });
  };

  const flipCard = useCallback(async (index: number) => {
    if (!openPack || revealed.has(index)) return;
    if (state?.settings.overlayMode === "synced") {
      await request(`/api/packs/${openPack.id}/flip`, { method: "POST", body: JSON.stringify({ index }) });
    }
    setRevealed((previous) => new Set(previous).add(index));
    if (revealed.size + 1 >= openPack.cards.length) {
      await refresh();
    }
  }, [openPack, refresh, revealed, state?.settings.overlayMode]);

  useEffect(() => {
    if (!openPack || tab !== "Packs" || skipAnimation || revealed.size >= openPack.cards.length) return;
    const nextIndex = openPack.cards.findIndex((_, index) => !revealed.has(index));
    if (nextIndex < 0) return;

    const timer = window.setTimeout(() => {
      void flipCard(nextIndex).catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not reveal the next card.");
      });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [flipCard, openPack, revealed, skipAnimation, tab]);

  const flipAll = () => run(async () => {
    if (!openPack) return;
    await request(`/api/packs/${openPack.id}/flip`, { method: "POST", body: JSON.stringify({ all: true }) });
    setRevealed(new Set(openPack.cards.map((_, index) => index)));
    await refresh();
  });

  const undo = (entry: LedgerEntry) => run(async () => {
    await request(`/api/ledger/${entry.id}/undo`, { method: "POST" });
    setSuccess("Transaction reversed.");
    await refresh();
  });

  const updateSettings = (patch: Partial<Settings>) => run(async () => {
    await request("/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
    await refresh();
    setSuccess("Settings saved.");
  });

  const craft = (itemId: string) => run(async () => {
    await request("/api/collection/craft", { method: "POST", body: JSON.stringify({ itemId }) });
    await refresh();
    setSuccess("Card crafted.");
  });

  const testOverlay = () => run(async () => {
    await request("/api/overlay/test", { method: "POST" });
    setSuccess("Test event sent to the overlay.");
  });

  const regenerateOverlayToken = () => run(async () => {
    const result = await request<{ token: string }>("/api/settings/overlay-token", { method: "POST" });
    setOverlaySecret(result.token);
    setSuccess("Overlay token regenerated. Copy the new URL before closing this page.");
  });

  const reset = () => run(async () => {
    if (!window.confirm("Wipe coins, scrap, collection and pity for this game mode? Pack history will be preserved.")) return;
    await request("/api/reset", { method: "POST" });
    await refresh();
    setSuccess("Collection and balances reset. Pull history was preserved.");
  });

  if (window.location.pathname === "/overlay") {
    return <Overlay />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Tarkov TCG home"><span className="brand-mark">T</span><span>TARKOV<span className="brand-muted">TCG</span></span></a>
        <div className="wallet">
          <div className="wallet-item"><span className="wallet-icon coin-icon">₡</span><span><b>{(state?.coins ?? 0).toLocaleString()}</b><small>COINS</small></span></div>
          <div className="wallet-item"><span className="wallet-icon scrap-icon">◆</span><span><b>{(state?.scrap ?? 0).toLocaleString()}</b><small>SCRAP</small></span></div>
        </div>
        <div className="xp-widget">
          <input aria-label="Raid XP" inputMode="numeric" placeholder="RAID XP" value={xpInput} onChange={(event) => setXpInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && Number(xpInput) > 0) void addXp(Number(xpInput)); }} />
          <button className="add-xp" disabled={busy || Number(xpInput) < 1} onClick={() => void addXp(Number(xpInput))}>+ ADD XP</button>
          <div className="quick-xp">{[1000, 2500, 5000].map((amount) => <button key={amount} onClick={() => void addXp(amount)}>+{amount >= 1000 ? `${amount / 1000}K` : amount}</button>)}</div>
        </div>
        <div className="progress-mini"><span>COLLECTION</span><b>{distinctOwned} <i>/</i> {itemCount}</b><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>
      </header>

      <nav className="main-nav" aria-label="Main navigation">
        {(["Packs", "Collection", "History & Stats", "Settings"] as Tab[]).map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}</button>)}
        <a className="overlay-link" href="/overlay" target="_blank" rel="noreferrer">↗ OBS OVERLAY</a>
      </nav>

      <main className="page">
        {error && <div className="notice error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
        {success && <div className="notice success">{success}<button onClick={() => setSuccess("")}>×</button></div>}

        {tab === "Packs" && <section>
          <div className="page-heading"><div><p className="eyebrow">YOUR NEXT RAID REWARD</p><h1>Trader Packs</h1><p className="subheading">Turn raid XP into a collection worth chasing.</p></div><div className="mode-pill">{state?.gameMode === "pve" ? "PVE" : "REGULAR"} MODE</div></div>
          <div className="trader-filters"><button className={selectedTrader === "All" ? "selected" : ""} onClick={() => { setSelectedTrader("All"); setActivePool(null); }}>ALL TRADERS</button>{[...new Set(state?.pools.map((pool) => pool.trader) ?? [])].map((trader) => <button key={trader} className={selectedTrader === trader ? "selected" : ""} onClick={() => { setSelectedTrader(trader); setActivePool(null); }}>{trader.toUpperCase()}</button>)}</div>
          <div className="pack-layout">
            <div className="pack-grid">
              {visiblePools.map((pool, index) => (
                <button className={`pack-tile trader-${pool.trader.toLowerCase()}`} key={pool.poolKey} onClick={() => setActivePool(pool.poolKey)}>
                  <span className="pack-num">PACK {String(index + 1).padStart(2, "0")}</span>
                  <span className="pack-art"><span>{pool.trader.slice(0, 1)}</span></span>
                  <span className="pack-name">{pool.trader}<small>LOYALTY LEVEL {pool.levelRange}</small></span>
                  <span className="pack-meta"><span>◈ {pool.packPrice.toLocaleString()} COINS</span><span>{pool.collectedCount} / {pool.itemCount}</span></span>
                  <span className="pack-progress"><i style={{ width: `${pool.itemCount ? (pool.collectedCount / pool.itemCount) * 100 : 0}%` }} /></span>
                </button>
              ))}
              {state?.pools.length === 0 && <div className="empty-state"><b>{state.settings.enabledItemClasses.length === 0 ? "All item classes are disabled" : state.settings.enabledItemClasses.length < ITEM_CLASS_IDS.length ? "No pools match the enabled classes" : "No trader pools yet"}</b><p>{state.settings.enabledItemClasses.length < ITEM_CLASS_IDS.length ? "Enable more classes in Settings to add items to packs." : "Run npm run seed to load trader inventories and item data from tarkov.dev."}</p></div>}
            </div>
            <div className="open-panel">
              <p className="eyebrow">SELECTED TRADER</p>
              <div className="selected-art"><span>{active?.trader.slice(0, 1) ?? "?"}</span></div>
              <h2>{active ? `${active.trader}: LL${active.levelRange}` : "Choose a pack"}</h2>
              <p>{active ? `${active.collectedCount} of ${active.itemCount} cards collected` : "Select one of the packs to get started."}</p>
              <div className="open-facts"><span>PACK SIZE <b>{state?.settings.packSize ?? 5} CARDS</b></span><span>PRICE <b>{active ? `${active.packPrice.toLocaleString()} COINS` : "—"}</b></span></div>
              <label className="skip-toggle"><input type="checkbox" checked={skipAnimation} onChange={(event) => setSkipAnimation(event.target.checked)} /> SKIP REVEAL ANIMATION</label>
              <button className="primary-button" disabled={!active || busy || (state?.coins ?? 0) < (active?.packPrice ?? Infinity)} onClick={buyPack}>{busy ? "OPENING..." : "BUY & OPEN PACK"}</button>
              {active && (state?.coins ?? 0) < active.packPrice && <small className="insufficient">Add more raid XP to open this pack.</small>}
            </div>
          </div>
          {openPack && <div className="reveal-backdrop">
            <div className="reveal-panel" role="dialog" aria-modal="true" aria-labelledby="pack-reveal-title">
              <div className="reveal-heading"><div><p className="eyebrow">{openPack.wasGodPack ? "✦ GOD PACK ✦" : "PACK OPENED"}</p><h2 id="pack-reveal-title">Reveal your cards</h2></div><button className="secondary-button" autoFocus onClick={() => setOpenPack(null)}>CLOSE</button></div>
              <div className="card-row">{openPack.cards.map((card, index) => <button key={`${openPack.id}-${index}`} aria-label={revealed.has(index) ? `${card.name}, ${card.rarity}` : "Reveal card"} className={`reveal-card rarity-${card.rarity.toLowerCase()} ${revealed.has(index) ? "revealed" : ""} ${card.isFoil ? "foil" : ""}`} onClick={() => void run(() => flipCard(index))}><span className="reveal-card-inner"><span className="card-back">T</span><span className="card-front"><span className="card-image">{items.find((item) => item.id === card.id)?.imageLocal ? <img src={items.find((item) => item.id === card.id)?.imageLocal ?? ""} alt="" /> : "▧"}</span><b>{card.name}</b><small>{card.rarity.toUpperCase()}</small>{card.isNew && <em>NEW</em>}{card.isFoil && <i>FOIL</i>}</span></span></button>)}</div>
              <button className="primary-button flip-button" disabled={revealed.size === openPack.cards.length || busy} onClick={() => void flipAll()}>FLIP ALL</button>
            </div>
          </div>}
        </section>}

        {tab === "Collection" && <section>
          <div className="page-heading"><div><p className="eyebrow">THE ARMORY</p><h1>Collection</h1><p className="subheading">{distinctOwned} / {itemCount} cards secured · {progress.toFixed(1)}% complete</p></div><div className="mode-pill">{state?.scrap ?? 0} SCRAP</div></div>
          <div className="trader-progress">{traderProgress.map(([trader, counts]) => <div key={trader}><span>{trader.toUpperCase()}</span><b>{counts.collected}/{counts.total}</b><i><em style={{ width: `${counts.total ? (counts.collected / counts.total) * 100 : 0}%` }} /></i></div>)}</div>
          <div className="collection-filters">
            <select value={filters.trader} onChange={(event) => setFilters({ ...filters, trader: event.target.value })}><option>All</option>{[...new Set(items.map((item) => item.trader))].map((trader) => <option key={trader}>{trader}</option>)}</select>
            <select value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })}><option value="All">All levels</option>{[1, 2, 3, 4].map((level) => <option value={level} key={level}>LL{level}</option>)}</select>
            <select value={filters.rarity} onChange={(event) => setFilters({ ...filters, rarity: event.target.value })}><option>All</option>{["Common", "Uncommon", "Rare", "Epic", "Legendary"].map((rarity) => <option key={rarity}>{rarity}</option>)}</select>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option>All</option><option>Unlocked</option><option>Missing</option></select>
            <input placeholder="SEARCH CARDS..." value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          </div>
          <div className="collection-grid">{filteredItems.map((item) => <article className={`collection-card ${item.ownedCount === 0 ? "locked" : ""} rarity-${item.rarity.toLowerCase()}`} key={item.id}>
            <div className="collection-image">{item.ownedCount > 0 && item.imageLocal ? <img src={item.imageLocal} alt="" /> : <span>{item.ownedCount > 0 ? "▧" : "???"}</span>}</div>
            <div className="collection-details"><small>{item.trader.toUpperCase()} · LL{item.loyaltyLevel}</small><b>{item.ownedCount > 0 ? item.name : "???"}</b><span>{item.ownedCount > 0 ? <>{item.ownedCount > 1 && <i>x{item.ownedCount}</i>}{item.foilCount > 0 && <i className="foil-badge">✦ {item.foilCount}</i>}<em>{item.rarity}</em></> : <em>{item.rarity}</em>}</span></div>
            <div className="card-actions">{item.wikiUrl && item.ownedCount > 0 && <a href={item.wikiUrl} target="_blank" rel="noreferrer" title="Open Tarkov wiki">↗</a>}{item.ownedCount === 0 && <button disabled={busy || (state?.scrap ?? 0) < ({ Common: 4, Uncommon: 8, Rare: 20, Epic: 60, Legendary: 160 }[item.rarity])} onClick={() => void craft(item.id)}>CRAFT</button>}</div>
          </article>)}</div>
        </section>}

        {tab === "History & Stats" && <section>
          <div className="page-heading"><div><p className="eyebrow">THE RAID LOG</p><h1>History & Stats</h1><p className="subheading">Every pack, every pull, every coin.</p></div></div>
          <div className="stat-grid"><Stat label="PACKS OPENED" value={state?.stats.packsOpened ?? 0} /><Stat label="GOD PACKS" value={state?.stats.godPacks ?? 0} /><Stat label="COINS SPENT" value={state?.stats.coinsSpent ?? 0} /><Stat label="COLLECTION" value={`${distinctOwned} / ${itemCount}`} /></div>
          <div className="highlight-grid"><article><small>LUCKIEST PACK</small><b>{state?.stats.luckiestPack ? state.stats.luckiestPack.cards.reduce((best, card) => ["Common", "Uncommon", "Rare", "Epic", "Legendary"].indexOf(card.rarity) > ["Common", "Uncommon", "Rare", "Epic", "Legendary"].indexOf(best) ? card.rarity : best, "Common" as Rarity) : "—"}</b><span>{state?.stats.luckiestPack?.cards.map((card) => card.name).join(" · ") ?? "No packs opened yet"}</span></article><article><small>RAREST PULL</small><b className={state?.stats.rarestPull ? `rarity-text-${state.stats.rarestPull.rarity.toLowerCase()}` : ""}>{state?.stats.rarestPull?.rarity ?? "—"}</b><span>{state?.stats.rarestPull?.name ?? "No pulls yet"}</span></article></div>
          <div className="completion-chart"><div><p className="eyebrow">COLLECTION OVER TIME</p><b>{state?.stats.completionHistory.at(-1)?.collected ?? 0} unique cards</b></div><svg viewBox="0 0 600 100" preserveAspectRatio="none" role="img" aria-label="Collection completion history"><polyline points={(state?.stats.completionHistory ?? []).map((point, index, list) => `${list.length <= 1 ? 0 : (index / (list.length - 1)) * 600},${95 - Math.min(1, point.collected / Math.max(1, itemCount)) * 85}`).join(" ")} /></svg></div>
          <h2 className="section-title">Recent packs</h2>
          <div className="history-list">{state?.packs.map((pack) => <article className="history-row" key={pack.id}><div className="history-icon">{pack.wasGodPack ? "✦" : "◈"}</div><div className="history-main"><b>{state.pools.find((pool) => pool.poolKey === pack.poolKey)?.trader ?? pack.poolKey} Pack</b><small>{new Date(pack.timestamp).toLocaleString()}</small></div><div className="history-pulls">{pack.cards.map((card, index) => <span className={`rarity-text-${card.rarity.toLowerCase()}`} key={`${pack.id}-${index}`} title={`${card.rarity}: ${card.name}`}>{card.name}</span>)}</div><b className="history-result">{pack.wasGodPack ? "GOD PACK" : "OPENED"}</b></article>)}</div>
          <h2 className="section-title">Recent transactions</h2>
          <div className="transaction-list">{state?.ledger.map((entry) => <article className="transaction-row" key={entry.id}><span>{entry.note ?? entry.type}</span><small>{new Date(entry.timestamp).toLocaleString()}</small><b className={entry.coinDelta >= 0 ? "positive" : ""}>{entry.coinDelta ? `${entry.coinDelta > 0 ? "+" : ""}${entry.coinDelta} coins` : `${entry.scrapDelta > 0 ? "+" : ""}${entry.scrapDelta} scrap`}</b>{["xp_entry", "pack_purchase"].includes(entry.type) && !state.ledger.some((candidate) => candidate.reversesId === entry.id) && <button className="text-button" onClick={() => void undo(entry)}>UNDO</button>}</article>)}</div>
        </section>}

        {tab === "Settings" && state && <section>
          <div className="page-heading"><div><p className="eyebrow">FIELD CONFIGURATION</p><h1>Settings</h1><p className="subheading">Tune the rules of your collection.</p></div></div>
          <div className="settings-layout">
            <div className="settings-section full-width">
              <h2>Item classes</h2>
              <p className="setting-description">Choose which item classes can appear in packs and the active collection. Existing cards are preserved and return when re-enabled. Items with multiple classes are excluded if any of their classes are disabled.</p>
              <div className="item-class-toolbar">
                <span>{state.settings.enabledItemClasses.length} / {ITEM_CLASS_IDS.length} classes enabled</span>
                <div className="item-class-actions">
                  <button className="secondary-button" disabled={busy} onClick={() => void updateSettings({ enabledItemClasses: [...ITEM_CLASS_IDS] })}>ENABLE ALL</button>
                  <button className="secondary-button" disabled={busy} onClick={() => void updateSettings({ enabledItemClasses: [] })}>DISABLE ALL</button>
                </div>
              </div>
              <div className="item-class-grid">
                {ITEM_CLASSES.map((itemClass) => <label className="item-class-toggle" key={itemClass.id}>
                  <input
                    type="checkbox"
                    checked={state.settings.enabledItemClasses.includes(itemClass.id)}
                    disabled={busy}
                    onChange={(event) => {
                      const enabled = new Set(state.settings.enabledItemClasses);
                      if (event.target.checked) enabled.add(itemClass.id);
                      else enabled.delete(itemClass.id);
                      void updateSettings({ enabledItemClasses: ITEM_CLASS_IDS.filter((id) => enabled.has(id)) });
                    }}
                  />
                  <span>{itemClass.label}</span>
                </label>)}
              </div>
            </div>
            <div className="settings-section"><h2>Economy & packs</h2><Setting label="XP per coin" value={state.settings.xpPerCoin} min={1} max={1_000_000} onSave={(value) => updateSettings({ xpPerCoin: value })} /><Setting label="Cards per pack" value={state.settings.packSize} min={1} max={20} onSave={(value) => updateSettings({ packSize: value })} /><Setting label="God pack chance (%)" value={state.settings.godPackChance * 100} min={0} max={100} step={0.1} onSave={(value) => updateSettings({ godPackChance: value / 100 })} /><Setting label="Foil chance (%)" value={state.settings.foilChance * 100} min={0} max={100} step={0.1} onSave={(value) => updateSettings({ foilChance: value / 100 })} /><Setting label="New card pity (packs)" value={state.settings.newCardPity} min={1} max={1000} onSave={(value) => updateSettings({ newCardPity: value })} /><Setting label="Epic pity (packs)" value={state.settings.epicPity} min={1} max={1000} onSave={(value) => updateSettings({ epicPity: value })} /><h2 className="settings-subheading">Rarity weights</h2>{(["Common", "Uncommon", "Rare", "Epic", "Legendary"] as Rarity[]).map((rarity) => <Setting key={rarity} label={`${rarity} (%)`} value={state.settings.rarityWeights[rarity]} min={0} max={100} step={0.1} onSave={(value) => updateSettings({ rarityWeights: { ...state.settings.rarityWeights, [rarity]: value } })} />)}</div>
            <div className="settings-section"><h2>Game mode</h2><p className="setting-description">Progress and pools are separate for each mode.</p><div className="segmented"><button className={state.settings.gameMode === "regular" ? "chosen" : ""} onClick={() => void updateSettings({ gameMode: "regular" })}>REGULAR</button><button className={state.settings.gameMode === "pve" ? "chosen" : ""} onClick={() => void updateSettings({ gameMode: "pve" })}>PVE</button></div><h2 className="settings-subheading">OBS Overlay</h2><label className="setting-line"><span>Display duration (seconds)</span><input type="number" defaultValue={state.settings.overlayDuration} min={1} max={120} onBlur={(event) => { const value = Number(event.target.value); if (value !== state.settings.overlayDuration) void updateSettings({ overlayDuration: value }); }} /></label><label className="setting-line"><span>Reveal mode</span><select value={state.settings.overlayMode} onChange={(event) => void updateSettings({ overlayMode: event.target.value as Settings["overlayMode"] })}><option value="immediate">Immediate</option><option value="synced">Synced with dashboard</option></select></label><label className="setting-line"><span>HUD widget</span><input type="checkbox" checked={state.settings.overlayHud} onChange={(event) => void updateSettings({ overlayHud: event.target.checked })} /></label><label className="setting-line"><span>HUD corner</span><select value={state.settings.overlayPosition} onChange={(event) => void updateSettings({ overlayPosition: event.target.value as Settings["overlayPosition"] })}><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-right">Top right</option><option value="top-left">Top left</option></select></label><button className="secondary-button" onClick={() => void testOverlay()}>TEST OVERLAY</button><button className="secondary-button token-button" onClick={() => void regenerateOverlayToken()}>REGENERATE OVERLAY TOKEN</button>{overlaySecret && <div className="obs-instructions"><b>Copy this local overlay URL now</b><code>{overlayLocalUrl}{overlayHudQuery ? "&" : "?"}key={encodeURIComponent(overlaySecret)}</code></div>}<div className="obs-instructions"><b>OBS Browser Source</b><code>{overlayLocalUrl}</code><span>Use port 5173 during development (port 3000 after a production build). Add <code>?hud=true</code> to override the HUD toggle. 1920 × 1080 · transparent background · enable “Refresh browser when scene becomes active”.</span></div></div>
            <div className="settings-section full-width"><h2>Data & backup</h2><p className="setting-description">Seed trader items using tarkov.dev, repair missing local images, export your ledger, or wipe your local progress.</p><div className="button-row"><button className="secondary-button" onClick={() => void run(async () => { const result = await request<{ uniqueItems: number; pools: unknown[] }>("/api/data/seed", { method: "POST" }); await refresh(); setSuccess(`Seeded ${result.uniqueItems} items across ${result.pools.length} pools.`); })}>RE-SEED TRADER DATA</button><a className="secondary-button" href="/api/export" download="tarkov-tcg-backup.json">EXPORT BACKUP</a><label className="secondary-button">IMPORT BACKUP<input type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void run(async () => { if (!window.confirm("Importing replaces this game mode’s collection, balances and history. Continue?")) return; await request("/api/import", { method: "POST", body: await file.text() }); await refresh(); setSuccess("Backup imported."); }); event.target.value = ""; }} /></label><button className="secondary-button" onClick={() => void run(async () => { const result = await request<{ processed: number; repaired: number; remaining: number; errors: Array<{ itemId: string; error: string }> }>("/api/data/repair-images", { method: "POST" }); setSuccess(`Repaired ${result.repaired} of ${result.processed} images (${result.remaining} still missing).${result.errors.length ? ` ${result.errors.length} lookup errors.` : ""}`); await refresh(); })}>REPAIR MISSING IMAGES</button><button className="danger-button" onClick={() => void reset()}>WIPE RESET</button></div></div>
            <p className="disclaimer full-width">Tarkov TCG is an independent fan project and is not affiliated with or endorsed by Battlestate Games. Item names and artwork belong to their respective owners; source links are provided where available. Non-commercial fan use.</p>
          </div>
        </section>}

        <footer className="site-footer"><span>TARKOV TCG · RAID. COLLECT. REPEAT.</span><span>Independent fan project · Not affiliated with Battlestate Games</span></footer>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <article className="stat-card"><span>{label}</span><b>{typeof value === "number" ? value.toLocaleString() : value}</b></article>;
}

function Setting({ label, value, min, max, step = 1, onSave }: { label: string; value: number; min: number; max: number; step?: number; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="setting-line"><span>{label}</span><input type="number" value={draft} min={min} max={max} step={step} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const parsed = Number(draft); if (Number.isFinite(parsed) && parsed >= min && parsed <= max && parsed !== value) onSave(parsed); else if (!Number.isFinite(parsed) || parsed < min || parsed > max) setDraft(String(value)); }} /></label>;
}

interface OverlayCard extends DrawnCard {
  imageLocal?: string | null;
}

interface OverlayEvent {
  poolKey: string;
  cards: OverlayCard[];
  godPack: boolean;
  packId?: string;
  duration?: number;
  overlayMode?: "immediate" | "synced";
  isTest?: boolean;
}

function Overlay() {
  const params = new URLSearchParams(window.location.search);
  const requestedCorner = params.get("position");
  const positionOverride = ["bottom-right", "bottom-left", "top-right", "top-left"].includes(requestedCorner ?? "") ? requestedCorner : null;
  const key = params.get("key");
  const [hud, setHud] = useState({ coins: 0, collected: 0, total: 0 });
  const [active, setActive] = useState<OverlayEvent | null>(null);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [queue, setQueue] = useState<OverlayEvent[]>([]);
  const [flippedBeforeShow] = useState(() => new Map<string, Set<number>>());
  const activeRef = useRef<OverlayEvent | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const hudEnabled = params.has("hud") ? params.get("hud") === "true" : settings?.overlayHud ?? false;
  const corner = positionOverride ?? settings?.overlayPosition ?? "bottom-right";
  activeRef.current = active;

  useEffect(() => {
    void request<AppState>("/api/state").then((next) => {
      setSettings(next.settings);
      setHud({ coins: next.coins, collected: next.collection.length, total: next.pools.reduce((sum, pool) => sum + pool.itemCount, 0) });
    }).catch((caught: unknown) => console.error("Overlay state load failed", caught));
  }, []);

  useEffect(() => {
    const url = new URL("/api/events", window.location.origin);
    if (key) url.searchParams.set("key", key);
    const source = new EventSource(url);
    source.addEventListener("hud_update", (message) => {
      const data = JSON.parse((message as MessageEvent).data) as { coins: number; collected: number; total: number };
      setHud(data);
    });
    source.addEventListener("pack_opened", (message) => {
      const data = JSON.parse((message as MessageEvent).data) as OverlayEvent;
      setQueue((previous) => [...previous, data]);
    });
    source.addEventListener("card_flipped", (message) => {
      const { packId, cardIndex } = JSON.parse((message as MessageEvent).data) as { packId: string; cardIndex: number };
      if (activeRef.current?.packId === packId) {
        setShown((previous) => new Set(previous).add(cardIndex));
      } else {
        const indexes = flippedBeforeShow.get(packId) ?? new Set<number>();
        indexes.add(cardIndex);
        flippedBeforeShow.set(packId, indexes);
      }
    });
    source.addEventListener("test", (message) => {
      const data = JSON.parse((message as MessageEvent).data) as OverlayEvent;
      setQueue((previous) => [...previous, { ...data, isTest: true, overlayMode: "immediate" }]);
    });
    return () => source.close();
  }, [key, flippedBeforeShow]);

  useEffect(() => {
    if (active || queue.length === 0) return;
    const [next, ...remaining] = queue;
    setQueue(remaining);
    const savedFlips = next?.packId ? flippedBeforeShow.get(next.packId) : undefined;
    setShown(new Set(savedFlips ?? []));
    if (next?.packId) flippedBeforeShow.delete(next.packId);
    setActive(next ?? null);
  }, [active, queue, flippedBeforeShow]);

  useEffect(() => {
    if (!active) return;
    const duration = Math.max(1000, (active.duration ?? settings?.overlayDuration ?? 9) * 1000);
    const timer = window.setTimeout(() => {
      setActive(null);
      setShown(new Set());
    }, duration);
    return () => window.clearTimeout(timer);
  }, [active, settings?.overlayDuration]);

  useEffect(() => {
    if (!active || active.overlayMode === "synced") return;
    const timer = window.setInterval(() => {
      setShown((previous) => {
        const next = new Set(previous);
        const following = active.cards.findIndex((_, index) => !next.has(index));
        if (following >= 0) next.add(following);
        return next;
      });
    }, 420);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active && !hudEnabled) return <div className="overlay-canvas" aria-hidden="true" />;
  return <div className="overlay-canvas">
    {hudEnabled && <div className={`overlay-hud ${corner}`}><span>₡ {hud.coins.toLocaleString()}</span><span>◈ {hud.collected} / {hud.total}</span></div>}
    {active && <div className={`overlay-pack ${active.godPack ? "god-pack" : ""}`}>
      <div className="overlay-title">{active.godPack ? "✦ GOD PACK ✦" : active.isTest ? "TEST PACK" : "PACK OPENED"}</div>
      <div className="overlay-cards">{active.cards.map((card, index) => <article key={`${active.packId ?? "test"}-${index}`} className={`overlay-card rarity-${card.rarity.toLowerCase()} ${shown.has(index) ? "show" : ""} ${card.isFoil ? "foil" : ""}`}><div className="overlay-card-inner"><div className="overlay-card-back">T</div><div className="overlay-card-front">{card.isNew && <small className="overlay-new">NEW</small>}<div className="overlay-card-art">{card.imageLocal ? <img src={card.imageLocal} alt="" /> : <span className="overlay-card-placeholder" aria-hidden="true">▧</span>}</div><span className="overlay-card-name">{card.name}</span><b>{card.rarity.toUpperCase()}</b>{card.isFoil && <i>FOIL ✦</i>}</div></div></article>)}</div>
    </div>}
  </div>;
}

export default App;
