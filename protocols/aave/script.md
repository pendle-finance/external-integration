// Aave integration generator (Aave v3 + v4).
//
// Regenerates protocols/aave/config.yaml from live data. Run it and copy the
// stdout into config.yaml (stderr carries progress + loud warnings):
//
//   npx ts-node script.ts > config.yaml
//
// Chains are derived DYNAMICALLY from Pendle's getSupportChains endpoint,
// intersected per protocol with Aave's own supported-chain list. For each PT
// that Aave accepts as collateral, one row is emitted per major borrowable
// stablecoin (STABLE_BORROW) in that market/spoke — matching the shape of the
// previously hand-maintained config. Every emitted PT is cross-checked against
// Pendle's simplified-data list (CI parity) and the run fails loud (emits
// nothing) on any API/empty-response error.
//
// v3 (api.v3.aave.com): rich schema — symbols, markets, collateral/borrow flags
//   all available. URL: app.aave.com/reserve-overview/?underlyingAsset&marketName
// v4 (api.v4.aave.com): hub/spoke model, and its GraphQL exposes NO token
//   symbols. Symbols are resolved from a dictionary built out of the v3 reserves
//   plus Pendle's asset registry (assets/all) — a v4 token with no resolvable
//   symbol is skipped LOUDLY, never guessed. URL: pro.aave.com/explore/reserve/{id}
//   (the reserve `id` is exactly the app's base64 route param).

import * as yaml from 'js-yaml';

const PENDLE_CHAINS_URL =
  'https://api-v2.pendle.finance/core/v1/chains?includeAdditional=true';
const PENDLE_ASSETS_URL =
  'https://api-v2.pendle.finance/core/v1/querier/simplified-data';
const AAVE_V3_GRAPHQL = 'https://api.v3.aave.com/graphql';
const AAVE_V4_GRAPHQL = 'https://api.v4.aave.com/graphql';

// Borrow assets shown per PT collateral. PTs are yield-stablecoin collateral, so
// we surface the major borrowable stablecoins. Edit this set to widen/narrow
// which borrow targets appear.
const STABLE_BORROW = new Set([
  'USDC',
  'USDT',
  'USDT0',
  'USDe',
  'GHO',
  'USDG',
  'USDS',
  'DAI',
  'RLUSD',
]);

// Aave v3 market name -> reserve-overview `marketName` slug. A PT-collateral
// market not mapped here is skipped LOUDLY (never guessed).
const AAVE_V3_MARKET_NAME: Record<string, string> = {
  AaveV3Ethereum: 'proto_ethereum_v3',
  AaveV3Plasma: 'proto_plasma_v3',
};

const DESCRIPTION_MAX = 120;
const isPt = (sym?: string): boolean => /^pt-/i.test(sym ?? '');

interface PtRow {
  chainId: number;
  address: string;
  subtitle: string;
  integrationUrl: string;
  description: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

async function gql<T>(endpoint: string, query: string): Promise<T> {
  const body = await fetchJson<{ data: T; errors?: unknown }>(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (body.errors) {
    throw new Error(`GraphQL error (${endpoint}): ${JSON.stringify(body.errors)}`);
  }
  return body.data;
}

async function getSupportedChainIds(): Promise<number[]> {
  const { chainIds } = await fetchJson<{ chainIds: number[] }>(PENDLE_CHAINS_URL);
  if (!Array.isArray(chainIds) || chainIds.length === 0) {
    throw new Error('getSupportChains returned an empty/invalid chain list');
  }
  return chainIds;
}

async function getPendlePtSet(): Promise<Set<string>> {
  const { data } = await fetchJson<{
    data: Array<{ chainId: number; pts?: string[]; crossPts?: Array<{ spokePt: string }> }>;
  }>(PENDLE_ASSETS_URL);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('simplified-data returned an empty/invalid asset list');
  }
  const set = new Set<string>();
  for (const { chainId, pts, crossPts } of data) {
    (pts ?? []).forEach((pt) => set.add(`${chainId}-${pt.toLowerCase()}`));
    (crossPts ?? []).forEach((c) => set.add(`${chainId}-${c.spokePt.toLowerCase()}`));
  }
  return set;
}

// address -> symbol across the given chains, from Pendle's asset registry.
// Needed because Aave v4 exposes no token symbols and some v4-only PTs are
// absent from the v3 dictionary.
async function getPendleSymbols(chainIds: number[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const chainId of chainIds) {
    let assets: Array<{ address?: string; symbol?: string }>;
    try {
      assets = await fetchJson(
        `https://api-v2.pendle.finance/core/v1/${chainId}/assets/all`,
      );
    } catch {
      continue; // not a Pendle core chain; skip quietly
    }
    for (const a of assets) {
      if (a.address && a.symbol) map.set(`${chainId}-${a.address.toLowerCase()}`, a.symbol);
    }
  }
  return map;
}

function pushRow(
  rows: PtRow[],
  x: { chainId: number; address: string; subtitle: string; integrationUrl: string; ptSymbol: string },
): void {
  const description = `${x.ptSymbol} can be used as collateral to borrow ${x.subtitle} on Aave`;
  if (description.length > DESCRIPTION_MAX) {
    console.error(`WARN description >${DESCRIPTION_MAX}, skipped: ${x.ptSymbol}/${x.subtitle}`);
    return;
  }
  rows.push({
    chainId: x.chainId,
    address: x.address.toLowerCase(),
    subtitle: x.subtitle,
    integrationUrl: x.integrationUrl,
    description,
  });
}

// ---- Aave v3 ---------------------------------------------------------------
interface V3Reserve {
  underlyingToken: { address: string; symbol: string };
  supplyInfo: { canBeCollateral: boolean } | null;
  borrowInfo: { borrowingState: string } | null;
}
interface V3Market {
  name: string;
  chain: { chainId: number };
  reserves: V3Reserve[];
}

async function aaveV3ChainIds(): Promise<number[]> {
  const data = await gql<{ chains: Array<{ chainId: number }> }>(
    AAVE_V3_GRAPHQL,
    '{ chains(filter: ALL) { chainId } }',
  );
  return data.chains.map((c) => c.chainId);
}

// Returns { rows, symbolByAddr }; symbolByAddr seeds v4 symbol resolution.
async function generateV3(
  pendleChains: number[],
  ptSet: Set<string>,
): Promise<{ rows: PtRow[]; symbolByAddr: Map<string, string> }> {
  const v3Chains = await aaveV3ChainIds();
  const chains = pendleChains.filter((c) => v3Chains.includes(c));
  const data = await gql<{ markets: V3Market[] }>(
    AAVE_V3_GRAPHQL,
    `{ markets(request: { chainIds: [${chains.join(',')}] }) {
        name
        chain { chainId }
        reserves {
          underlyingToken { address symbol }
          supplyInfo { canBeCollateral }
          borrowInfo { borrowingState }
        }
      } }`,
  );

  const rows: PtRow[] = [];
  const symbolByAddr = new Map<string, string>();
  const skippedMarkets = new Set<string>();

  for (const m of data.markets) {
    const chainId = m.chain.chainId;
    for (const r of m.reserves) {
      symbolByAddr.set(
        `${chainId}-${r.underlyingToken.address.toLowerCase()}`,
        r.underlyingToken.symbol,
      );
    }

    const borrowStables = m.reserves.filter(
      (r) =>
        r.borrowInfo?.borrowingState === 'ENABLED' &&
        STABLE_BORROW.has(r.underlyingToken.symbol),
    );
    const pts = m.reserves.filter(
      (r) => isPt(r.underlyingToken.symbol) && r.supplyInfo?.canBeCollateral,
    );
    if (!pts.length) continue;

    const marketName = AAVE_V3_MARKET_NAME[m.name];
    if (!marketName) {
      skippedMarkets.add(`${m.name}(chain ${chainId})`);
      continue;
    }

    for (const pt of pts) {
      const address = pt.underlyingToken.address.toLowerCase();
      if (!ptSet.has(`${chainId}-${address}`)) continue;
      for (const b of borrowStables) {
        pushRow(rows, {
          chainId,
          address,
          subtitle: b.underlyingToken.symbol,
          integrationUrl: `https://app.aave.com/reserve-overview/?underlyingAsset=${address}&marketName=${marketName}`,
          ptSymbol: pt.underlyingToken.symbol,
        });
      }
    }
  }

  if (skippedMarkets.size) {
    console.error(
      `WARN v3 PT markets on unmapped market(s) skipped (add to AAVE_V3_MARKET_NAME): ${[
        ...skippedMarkets,
      ].join(', ')}`,
    );
  }
  return { rows, symbolByAddr };
}

// ---- Aave v4 ---------------------------------------------------------------
interface V4Reserve {
  id: string;
  canUseAsCollateral: boolean;
  canBorrow: boolean;
  spoke: { id: string } | null;
  asset: { underlying: { address: string } | null } | null;
}

async function aaveV4ChainIds(): Promise<number[]> {
  const data = await gql<{ chains: Array<{ chainId: number }> }>(
    AAVE_V4_GRAPHQL,
    '{ chains(request: { query: { filter: ALL } }) { chainId } }',
  );
  return data.chains.map((c) => c.chainId);
}

async function generateV4(
  pendleChains: number[],
  ptSet: Set<string>,
  symbolByAddr: Map<string, string>,
): Promise<PtRow[]> {
  const v4Chains = await aaveV4ChainIds();
  const chains = pendleChains.filter((c) => v4Chains.includes(c));
  const rows: PtRow[] = [];
  const unresolved = new Set<string>();

  for (const chainId of chains) {
    const data = await gql<{ reserves: V4Reserve[] }>(
      AAVE_V4_GRAPHQL,
      `{ reserves(request: { query: { chainIds: [${chainId}] } }) {
          id
          canUseAsCollateral
          canBorrow
          spoke { id }
          asset { underlying { address } }
        } }`,
    );

    // Group reserves by spoke to find each spoke's borrowable stablecoins.
    const bySpoke = new Map<string, V4Reserve[]>();
    for (const r of data.reserves) {
      const spoke = r.spoke?.id ?? 'none';
      if (!bySpoke.has(spoke)) bySpoke.set(spoke, []);
      bySpoke.get(spoke)!.push(r);
    }

    for (const r of data.reserves) {
      if (!r.canUseAsCollateral) continue;
      const address = r.asset?.underlying?.address?.toLowerCase();
      // Not a Pendle PT -> skip quietly. A Pendle PT with no resolvable symbol
      // -> skip LOUDLY (should not happen once Pendle's registry is unioned in).
      if (!address || !ptSet.has(`${chainId}-${address}`)) continue;
      const ptSymbol = symbolByAddr.get(`${chainId}-${address}`);
      if (!isPt(ptSymbol)) {
        unresolved.add(`${chainId}-${address} (collateral PT symbol)`);
        continue;
      }

      const borrowStables = (bySpoke.get(r.spoke?.id ?? 'none') ?? []).filter((x) => {
        if (!x.canBorrow) return false;
        const a = x.asset?.underlying?.address?.toLowerCase();
        const sym = a && symbolByAddr.get(`${chainId}-${a}`);
        if (!sym) {
          if (a) unresolved.add(`${chainId}-${a}`);
          return false;
        }
        return STABLE_BORROW.has(sym);
      });

      for (const b of borrowStables) {
        const sym = symbolByAddr.get(`${chainId}-${b.asset!.underlying!.address.toLowerCase()}`)!;
        pushRow(rows, {
          chainId,
          address,
          subtitle: sym,
          integrationUrl: `https://pro.aave.com/explore/reserve/${r.id}`,
          ptSymbol: ptSymbol as string,
        });
      }
    }
  }

  if (unresolved.size) {
    console.error(`WARN v4 borrow assets with no symbol (skipped): ${unresolved.size} tokens`);
  }
  return rows;
}

async function main(): Promise<void> {
  const [pendleChains, ptSet] = await Promise.all([
    getSupportedChainIds(),
    getPendlePtSet(),
  ]);

  const { rows: v3Rows, symbolByAddr } = await generateV3(pendleChains, ptSet);
  console.error(`v3: ${v3Rows.length} rows`);

  // Union Pendle's asset registry into the symbol dict so v4-only PTs resolve.
  const pendleSymbols = await getPendleSymbols(pendleChains);
  for (const [k, v] of pendleSymbols) if (!symbolByAddr.has(k)) symbolByAddr.set(k, v);

  const v4Rows = await generateV4(pendleChains, ptSet, symbolByAddr);
  console.error(`v4: ${v4Rows.length} rows`);

  // Merge + dedup on (chainId,address,subtitle): one row per PT + borrow asset.
  // v3 precedes v4, so an established v3 market wins over a v4 spoke, and the v4
  // hub/spoke model can't emit the same PT+borrow twice via different spokes.
  const seen = new Set<string>();
  const pt: PtRow[] = [];
  for (const r of [...v3Rows, ...v4Rows]) {
    const k = `${r.chainId}-${r.address}-${r.subtitle}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pt.push(r);
  }
  pt.sort(
    (a, b) =>
      a.chainId - b.chainId ||
      a.address.localeCompare(b.address) ||
      a.subtitle.localeCompare(b.subtitle) ||
      a.integrationUrl.localeCompare(b.integrationUrl),
  );
  console.error(
    `Emitted ${pt.length} rows across chains ${[...new Set(pt.map((r) => r.chainId))].join(', ')}`,
  );

  const config = {
    name: 'Aave',
    icon: 'logo.png',
    category: 'Money Market',
    description:
      'Aave is a decentralised non-custodial liquidity protocol where users can participate as suppliers or borrowers',
    url: 'https://app.aave.com/',
    metadata: { pt, yt: [], lp: [] },
  };
  process.stdout.write(yaml.dump(config, { lineWidth: 80, sortKeys: false, quotingType: "'" }));
}

// Fail loud: on any error, write nothing to stdout so a partial/empty config is
// never produced.
main().catch((err) => {
  console.error('GENERATION FAILED (no output written):', err.message);
  process.exit(1);
});
