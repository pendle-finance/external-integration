// run this basic .ts script in a script.ts file with ts-node script.ts. the logs will correspond to the config.yaml file.

// run this basic .ts script in a script.ts file with ts-node script.ts. the logs will correspond to the config.yaml file.

interface Market {
uniqueKey: string;
whitelisted: boolean;
collateralAsset: {
address: string;
symbol: string;
priceUsd: number | null;
chain: { network: string };
} | null;
loanAsset: {
address: string;
symbol: string;
priceUsd: number | null;
chain: { network: string };
} | null;
state: {
supplyAssetsUsd: number;
collateralAssetsUsd: number;
};
}

interface GraphQLMarketsResponse {
data: {
markets: {
items: Market[];
};
};
}

function isGraphQLMarketsResponse(
value: unknown
): value is GraphQLMarketsResponse {
return (
typeof value === "object" &&
value !== null &&
"data" in value &&
typeof (value as any).data === "object" &&
"markets" in (value as any).data &&
typeof (value as any).data.markets === "object" &&
"items" in (value as any).data.markets &&
Array.isArray((value as any).data.markets.items)
);
}

export async function fetchPTData(): Promise<void> {
let skip = 0;
let hasMore = true;
const collateralMarkets = new Map<string, string[]>();
let allFilteredMarkets: Market[] = [];

console.log("name: Morpho");
console.log("icon: logo.png");
console.log("category: Money Market");
console.log("metadata:");
console.log(" pt:");

// First pass: collect all markets
while (hasMore) {
const query = `           query {
              markets(first: 100, skip: ${skip}, where: { chainId_in: [1, 8453] }, orderBy: BorrowAssetsUsd, orderDirection: Desc) {
                items {
                  uniqueKey
                  whitelisted
                  collateralAsset {
                    address
                    symbol
                    priceUsd
                    chain {
                      network
                    }
                  }
                  loanAsset {
                    symbol
                  }
                }
              }
            }
      `;

    try {
      const response = await fetch("https://blue-api.morpho.org/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData: unknown = await response.json();
      if (!isGraphQLMarketsResponse(responseData)) {
        throw new Error("Unexpected API response structure");
      }

      const markets = responseData.data.markets.items;
      const filteredMarkets = markets.filter(
        (market) =>
          market.whitelisted &&
          market.loanAsset &&
          market.collateralAsset?.symbol?.toLowerCase().startsWith("pt-") &&
          market.collateralAsset?.address.toLowerCase() !==
            "0xd0097149aa4cc0d0e1fc99b8bd73fc17dc32c1e9"
      );

      // Store filtered markets and update collateralMarkets map
      filteredMarkets.forEach((market) => {
        if (!market.collateralAsset || !market.loanAsset) return;

        const collateralAddress = market.collateralAsset.address.toLowerCase();
        if (!collateralMarkets.has(collateralAddress)) {
          collateralMarkets.set(collateralAddress, []);
        }
        collateralMarkets.get(collateralAddress)?.push(market.uniqueKey);
      });

      allFilteredMarkets.push(...filteredMarkets);
      skip += 100;
      hasMore = markets.length === 100;
    } catch (error) {
      console.error("Error fetching markets:", error);
      break;
    }

}

// Sort all markets by collateral asset address and output
allFilteredMarkets
.sort((a, b) => {
const addressA = a.collateralAsset?.address.toLowerCase() || "";
const addressB = b.collateralAsset?.address.toLowerCase() || "";
return addressA.localeCompare(addressB);
})
.forEach((market) => {
if (!market.collateralAsset || !market.loanAsset) return;

      if (
        market.collateralAsset.address.toLowerCase() ===
        "0xd0097149aa4cc0d0e1fc99b8bd73fc17dc32c1e9"
      )
        return;

      const chainId =
        market.collateralAsset.chain.network.toLowerCase() === "ethereum"
          ? 1
          : 8453;

      console.log(`    - chainId: ${chainId}`);
      console.log(`      address: "${market.collateralAsset.address}"`);

      const collateralAddress = market.collateralAsset.address.toLowerCase();
      const marketsCount =
        collateralMarkets.get(collateralAddress)?.length || 0;
      if (marketsCount > 1) {
        console.log(`      subtitle: ${market.loanAsset.symbol}`);
      }

      console.log(
        `      integrationUrl: https://app.morpho.org/market?id=${
          market.uniqueKey
        }&network=${chainId === 1 ? "mainnet" : "base"}`
      );
      console.log(`      description: >-`);
      console.log(
        `        The ${market.collateralAsset.symbol} is the asset used as collateral in a Morpho`
      );
      console.log(
        `        market with ${market.loanAsset.symbol} as the loan token.`
      );
    });

console.log(" yt: []");
console.log(" lp: []");
}

fetchPTData().then(() => {
// Done
});
