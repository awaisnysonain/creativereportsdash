#!/bin/bash
set -e
BASE="http://localhost:3000/api/jobs/run"
for job in syncMetaWindow syncTripleWhaleWindow mergeCreativeData computeCreativeAnalysis generateWeeklyAIReport; do
  echo "=== $job ==="
  curl -s -X POST "$BASE" -H "Content-Type: application/json" -d "{\"job\":\"$job\",\"brand\":\"NOBL\"}" | head -c 500
  echo
done
