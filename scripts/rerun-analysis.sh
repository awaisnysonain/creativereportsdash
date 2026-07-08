#!/bin/bash
set -e
cd /var/www/creative-reports
RUN_ID=$(npx tsx -e "import './scripts/load-env'; import { latestSuccessfulRun } from './src/lib/db/repositories'; (async()=>{ const r=await latestSuccessfulRun(); if(!r){console.error('no run'); process.exit(1)}; console.log(r.id); })()")
echo "Run: $RUN_ID"

echo "=== merge (L7+L30 with fixed parser) ==="
curl -s -X POST localhost:3000/api/jobs/run -H 'content-type: application/json' --max-time 300 \
  -d "{\"job\":\"mergeCreativeData\",\"brand\":\"NOBL\",\"runId\":\"$RUN_ID\"}"
echo

echo "=== analysis ==="
curl -s -X POST localhost:3000/api/jobs/run -H 'content-type: application/json' --max-time 300 \
  -d "{\"job\":\"computeCreativeAnalysis\",\"brand\":\"NOBL\",\"runId\":\"$RUN_ID\"}"
echo

echo "=== AI report ==="
REP=$(curl -s -X POST localhost:3000/api/jobs/run -H 'content-type: application/json' --max-time 300 \
  -d "{\"job\":\"generateWeeklyAIReport\",\"brand\":\"NOBL\",\"runId\":\"$RUN_ID\"}")
echo "$REP"
REPORT_ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('reportId',''))" "$REP")
echo "Report: $REPORT_ID"

if [ -n "$REPORT_ID" ]; then
  echo "=== Slack ==="
  curl -s -X POST localhost:3000/api/jobs/run -H 'content-type: application/json' -H 'host: 52.77.228.212' --max-time 120 \
    -d "{\"job\":\"postSlackSummary\",\"brand\":\"NOBL\",\"runId\":\"$RUN_ID\",\"reportId\":\"$REPORT_ID\"}"
  echo
fi

echo "=== verify labels ==="
npx tsx scripts/verify-labels.ts "$RUN_ID"
