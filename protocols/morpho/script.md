// Morpho integration generator.
//
// Regenerates protocols/morpho/config.yaml from live data. Run it and copy the
// stdout into config.yaml (stderr carries progress + loud warnings):
//
//   npx ts-node script.ts > config.yaml
//
// Chains are derived DYNAMICALLY from Pendle's getSupportChains endpoint
// intersected with Morpho's own supported-chain list — there is no hardcoded
// chain array to maintain. When Pendle (or Morpho) launches a new chain, its
// PT-collateral markets flow in automatically. The ONLY per-chain lookup left is
// the app.morpho.org URL slug (MORPHO_CHAIN_SLUG); a listed PT market on an
// unmapped chain is skipped LOUDLY (never emitted with a guessed slug) so the
// gap surfaces in review instead of shipping a broken link.

import * as yaml from 'js-yaml';

const PENDLE_CHAINS_URL =
  'https://api-v2.pendle.finance/core/v1/chains?includeAdditional=true';
const PENDLE_ASSETS_URL =
  'https://api-v2.pendle.finance/core/v1/querier/simplified-data';
const MORPHO_GRAPHQL = 'https://blue-api.morpho.org/graphql';

// Collateral explicitly excluded from the registry (carried over from the
// previous generator).
const EXCLUDED_COLLATERAL = '0xd0097149aa4cc0d0e1fc99b8bd73fc17dc32c1e9';

// chainId -> app.morpho.org URL slug. Mirrors MORPHO_CHAINID_MAP in
// pendle-backend-v2 (apps/sync/src/external-protocol/protocols/morpho/
// morpho.protocol.ts), the authoritative slug source. Unlike the backend, an
// unmapped chain is skipped loudly here rather than defaulting to 'ethereum'.
const MORPHO_CHAIN_SLUG: Record<number, string> = {
  1: 'ethereum',
  130: 'unichain',
  143: 'monad',
  999: 'hyperevm',
  8453: 'base',
  42161: 'arbitrum',
};

const DESCRIPTION_MAX = 120;

interface MorphoMarket {
  marketId: string;
  listed: boolean;
  collateralAsset: {
    address: string;
    symbol: string;
    chain: { id: number };
  } | null;
  loanAsset: { symbol: string } | null;
}

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

async function gqlQuery<T>(query: string): Promise<T> {
  const body = await fetchJson<{ data: T; errors?: unknown }>(MORPHO_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (body.errors) {
    throw new Error(`Morpho GraphQL error: ${JSON.stringify(body.errors)}`);
  }
  return body.data;
}

// Pendle's supported chains — the dynamic chain universe (getSupportChains).
async function getSupportedChainIds(): Promise<number[]> {
  const { chainIds } = await fetchJson<{ chainIds: number[] }>(
    PENDLE_CHAINS_URL,
  );
  if (!Array.isArray(chainIds) || chainIds.length === 0) {
    throw new Error('getSupportChains returned an empty/invalid chain list');
  }
  return chainIds;
}

// The exact PT set validate-config.js checks against — guarantees CI parity.
async function getPendlePtSet(): Promise<Set<string>> {
  const { data } = await fetchJson<{
    data: Array<{
      chainId: number;
      pts?: string[];
      crossPts?: Array<{ spokePt: string }>;
    }>;
  }>(PENDLE_ASSETS_URL);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('simplified-data returned an empty/invalid asset list');
  }
  const set = new Set<string>();
  for (const { chainId, pts, crossPts } of data) {
    (pts ?? []).forEach((pt) => set.add(`${chainId}-${pt.toLowerCase()}`));
    (crossPts ?? []).forEach((c) =>
      set.add(`${chainId}-${c.spokePt.toLowerCase()}`),
    );
  }
  return set;
}

// Morpho errors on unknown chainIds, so we query only the intersection.
async function getMorphoChainIds(): Promise<number[]> {
  const data = await gqlQuery<{ chains: Array<{ id: number }> }>(
    '{ chains { id } }',
  );
  return data.chains.map((c) => c.id);
}

async function fetchMorphoMarkets(chainIds: number[]): Promise<MorphoMarket[]> {
  const all: MorphoMarket[] = [];
  let skip = 0;
  for (;;) {
    const data = await gqlQuery<{ markets: { items: MorphoMarket[] } }>(`query {
      markets(first: 100, skip: ${skip}, where: { chainId_in: [${chainIds.join(
        ',',
      )}] }, orderBy: BorrowAssetsUsd, orderDirection: Desc) {
        items {
          marketId
          listed
          collateralAsset { address symbol chain { id } }
          loanAsset { symbol }
        }
      }
    }`);
    const items = data.markets.items;
    all.push(...items);
    if (items.length < 100) break;
    skip += 100;
  }
  return all;
}

function buildRows(markets: MorphoMarket[], ptSet: Set<string>): PtRow[] {
  const rows: PtRow[] = [];
  const skippedChains = new Set<number>();

  for (const m of markets) {
    const ca = m.collateralAsset;
    if (!m.listed || !ca || !m.loanAsset) continue;
    if (!/^pt-/i.test(ca.symbol ?? '')) continue;

    const address = ca.address.toLowerCase();
    if (address === EXCLUDED_COLLATERAL) continue;

    // chainId comes straight from chain.id — never defaulted to Ethereum.
    const chainId = ca.chain?.id;
    if (typeof chainId !== 'number') continue;

    // CI parity: only emit PTs Pendle actually lists.
    if (!ptSet.has(`${chainId}-${address}`)) continue;

    const slug = MORPHO_CHAIN_SLUG[chainId];
    if (!slug) {
      skippedChains.add(chainId);
      continue;
    }

    const loan = m.loanAsset.symbol;
    const description = `The ${ca.symbol} is the asset used as collateral in a Morpho market with ${loan} as the loan token.`;
    if (description.length > DESCRIPTION_MAX) {
      console.error(
        `WARN description >${DESCRIPTION_MAX} chars, skipped: ${ca.symbol}/${loan}`,
      );
      continue;
    }

    rows.push({
      chainId,
      address,
      subtitle: loan,
      integrationUrl: `https://app.morpho.org/${slug}/market/${m.marketId}`,
      description,
    });
  }

  if (skippedChains.size) {
    console.error(
      `WARN listed PT markets on unmapped chain(s) skipped (add to MORPHO_CHAIN_SLUG): ${[
        ...skippedChains,
      ].join(', ')}`,
    );
  }

  // Deterministic ordering for stable diffs.
  rows.sort(
    (a, b) =>
      a.chainId - b.chainId ||
      a.address.localeCompare(b.address) ||
      a.subtitle.localeCompare(b.subtitle) ||
      a.integrationUrl.localeCompare(b.integrationUrl),
  );
  return rows;
}

async function main(): Promise<void> {
  const [pendleChains, ptSet, morphoChains] = await Promise.all([
    getSupportedChainIds(),
    getPendlePtSet(),
    getMorphoChainIds(),
  ]);

  const morphoSet = new Set(morphoChains);
  const queryChains = pendleChains.filter((c) => morphoSet.has(c));
  if (queryChains.length === 0) {
    throw new Error('No overlap between Pendle and Morpho supported chains');
  }
  console.error(`Querying Morpho on chains: ${queryChains.join(', ')}`);

  const markets = await fetchMorphoMarkets(queryChains);
  const pt = buildRows(markets, ptSet);
  console.error(
    `Emitted ${pt.length} PT rows across chains ${[
      ...new Set(pt.map((r) => r.chainId)),
    ].join(', ')}`,
  );

  const config = {
    name: 'Morpho',
    icon: 'logo.png',
    category: 'Money Market',
    url: 'https://app.morpho.org/ethereum/borrow',
    description:
      'A permissionless and non-custodial lending protocol where users can earn interest on over-collaterized lending and borrow digital assets using immutable infrastructure.',
    metadata: { pt, yt: [], lp: [] },
  };

  process.stdout.write(
    yaml.dump(config, { lineWidth: 80, sortKeys: false, quotingType: "'" }),
  );
}

// Fail loud: on any error, write nothing to stdout so a partial/empty config is
// never produced.
main().catch((err) => {
  console.error('GENERATION FAILED (no output written):', err.message);
  process.exit(1);
});
