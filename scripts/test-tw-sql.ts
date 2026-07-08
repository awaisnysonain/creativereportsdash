import "./load-env";

/**
 * Probe the Triple Whale Data-Out "Execute Custom SQL" endpoint against the
 * Pixel Joined table, to validate endpoint + auth + column availability before
 * wiring it into the service.
 */
async function main() {
  const storeKey = process.argv[2] ?? "nobl_main";
  const { getTwStore } = await import("../src/config/brands");
  const store = getTwStore(storeKey);
  if (!store) throw new Error(`unknown store ${storeKey}`);
  if (!store.configured) throw new Error(`store ${storeKey} not configured`);

  const query = `SELECT ad_id,
       MAX(ad_name) AS ad_name,
       SUM(spend) AS spend,
       SUM(order_revenue) AS attributed_revenue,
       SUM(new_customer_order_revenue) AS nc_revenue,
       SUM(new_visitors) AS new_visitors,
       SUM(unique_visitors) AS unique_visitors,
       SUM(orders_quantity) AS orders,
       SUM(new_customer_orders) AS new_customer_orders
FROM pixel_joined_tvf
WHERE event_date BETWEEN @startDate AND @endDate
  AND channel = 'facebook-ads'
  AND ad_id IS NOT NULL AND ad_id != ''
GROUP BY ad_id
LIMIT 5`;

  const body = {
    shopId: store.shopId,
    query,
    period: { startDate: "2026-06-30", endDate: "2026-07-06" },
    currency: "USD",
  };

  const res = await fetch("https://api.triplewhale.com/api/v2/orcabase/api/sql", {
    method: "POST",
    headers: { "x-api-key": store.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  console.log("HTTP", res.status);
  const text = await res.text();
  console.log(text.slice(0, 4000));
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
