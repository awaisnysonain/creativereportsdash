/**
 * Static metadata describing the jobs exposed as manual "run" buttons in the UI.
 * The actual execution is triggered through /api/jobs/run.
 */
export interface JobDefinition {
  key: string;
  label: string;
  description: string;
  requires: ("meta" | "tw" | "openai" | "slack" | "db")[];
  category: "sync" | "analysis" | "report" | "full";
}

export const JOB_REGISTRY: JobDefinition[] = [
  {
    key: "weeklyFullRun",
    label: "Weekly Full Run",
    description: "Sync Meta + Triple Whale, merge, analyze, generate AI report, and post to Slack.",
    requires: ["db", "meta", "tw", "openai", "slack"],
    category: "full",
  },
  {
    key: "syncMetaWindow",
    label: "Sync Meta (L7 + L30)",
    description: "Pull ad-level insights from the Meta Marketing API for both windows.",
    requires: ["db", "meta"],
    category: "sync",
  },
  {
    key: "syncTripleWhaleWindow",
    label: "Sync Triple Whale (L7 + L30)",
    description: "Pull ad-level metrics from Triple Whale for both windows.",
    requires: ["db", "tw"],
    category: "sync",
  },
  {
    key: "mergeCreativeData",
    label: "Merge Creative Data",
    description: "Join Meta + Triple Whale on ad_id, parse names, compute win/loss.",
    requires: ["db"],
    category: "analysis",
  },
  {
    key: "computeCreativeAnalysis",
    label: "Compute Analysis",
    description: "Build topline, breakouts, winners, and decelerators for the latest run.",
    requires: ["db"],
    category: "analysis",
  },
  {
    key: "generateWeeklyAIReport",
    label: "Generate AI Report",
    description: "Produce the weekly narrative report from the latest analysis snapshot.",
    requires: ["db", "openai"],
    category: "report",
  },
  {
    key: "postSlackSummary",
    label: "Post to Slack",
    description: "Post the latest report summary to the configured Slack channel.",
    requires: ["db", "slack"],
    category: "report",
  },
];
