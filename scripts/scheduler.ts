import "./load-env";
import { startWeeklyScheduler } from "../src/lib/scheduler/weekly";

/**
 * Standalone weekly scheduler process (optional).
 * The main server (`npm start`) registers the same cron automatically.
 * Use this only if you want scheduling in a separate process:
 *   npm run scheduler
 */
async function main() {
  const sched = startWeeklyScheduler();
  if (!sched.enabled) {
    console.log("Scheduler disabled. Set ENABLE_WEEKLY_SCHEDULER=true to enable.");
    process.exit(0);
  }
  console.log("\n⏰ Creative Reports scheduler running (standalone mode).");
  console.log(`   ${sched.day} @ ${sched.hour}:00 (${sched.timezone})`);
  console.log(`   Cron: "${sched.cron}"`);
  console.log(`   Dashboard: ${sched.dashboardUrl}\n`);
  process.stdin.resume();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
