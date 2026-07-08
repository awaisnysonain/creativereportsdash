#!/bin/bash
set -e
BASE="http://localhost:3000/api/jobs/run"
for job in mergeCreativeData computeCreativeAnalysis generateWeeklyAIReport; do
  echo "=== $job ==="
  curl -s -X POST "$BASE" -H "Content-Type: application/json" -d "{\"job\":\"$job\",\"brand\":\"NOBL\"}" | head -c 400
  echo
done
