#!/bin/bash
# Verify weekly cron is registered and report scheduler status.
set -e
curl -s http://localhost:3000/api/health | python3 -c "
import json, sys
d = json.load(sys.stdin)
s = d.get('scheduler') or {}
print('=== Weekly scheduler ===')
print('enabled:', s.get('enabled'))
print('started:', s.get('started'))
print('running:', s.get('running'))
print('cron:', s.get('cron'))
print('day:', s.get('day'), '@', s.get('hour'), ':00')
print('timezone:', s.get('timezone'))
print('dashboardUrl:', s.get('dashboardUrl'))
if not s.get('enabled'):
    raise SystemExit('FAIL: scheduler disabled')
if not s.get('started'):
    raise SystemExit('FAIL: scheduler not started')
print('OK: cron is active')
"
