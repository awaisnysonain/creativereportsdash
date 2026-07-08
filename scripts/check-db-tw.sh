#!/bin/bash
set -e
sudo -u postgres psql -d marketing_creative_reports <<'SQL'
SELECT id, status, trigger, finished_at::text
FROM sync_runs ORDER BY started_at DESC LIMIT 3;

SELECT 'tw_l7' AS label, COUNT(*) FROM triple_whale_ad_metrics WHERE "window" = 'L7';
SELECT 'tw_l30' AS label, COUNT(*) FROM triple_whale_ad_metrics WHERE "window" = 'L30';
SELECT 'meta_l7' AS label, COUNT(*) FROM meta_ad_metrics WHERE "window" = 'L7';

SELECT run_id, "window", COUNT(*) AS tw_rows
FROM triple_whale_ad_metrics
GROUP BY run_id, "window"
ORDER BY run_id DESC LIMIT 6;

SELECT run_id, has_tw_match, COUNT(*)
FROM merged_creative_metrics
WHERE "window" = 'L7'
GROUP BY run_id, has_tw_match
ORDER BY run_id DESC;

SELECT SUM(attributed_revenue::numeric) AS tw_rev, SUM(CASE WHEN has_tw_match THEN spend ELSE 0 END) AS tw_spend
FROM merged_creative_metrics
WHERE run_id = (SELECT id FROM sync_runs ORDER BY started_at DESC LIMIT 1) AND "window" = 'L7';

SELECT payload->'topline'->'l7'->>'twRoas' AS tw_roas,
       payload->'topline'->'l7'->>'ncRoas' AS nc_roas,
       payload->'topline'->'l7'->>'nvPct' AS nv_pct
FROM analysis_snapshots
ORDER BY created_at DESC LIMIT 1;
SQL
