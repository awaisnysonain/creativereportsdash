import { WebClient } from "@slack/web-api";
import { env } from "@/lib/env";

/**
 * Slack service — posts the weekly report summary to the configured channel.
 * Returns structured success/failure for logging and UI display.
 */

export interface SlackPostInput {
  title: string;
  slackSummary: string;
  reportUrl?: string;
  channelId?: string;
}

export interface SlackPostResult {
  ok: boolean;
  channelId: string;
  ts?: string;
  permalink?: string;
  error?: string;
}

function client(): WebClient | null {
  if (!env.SLACK_BOT_TOKEN) return null;
  return new WebClient(env.SLACK_BOT_TOKEN);
}

/** Build Slack Block Kit blocks for a polished message. */
function buildBlocks(input: SlackPostInput) {
  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: input.title.slice(0, 150), emoji: false },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: input.slackSummary.slice(0, 2900) },
    },
  ];
  if (input.reportUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open full report", emoji: false },
          url: input.reportUrl,
          style: "primary",
        },
      ],
    });
  }
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `Creative Reports • ${new Date().toLocaleString("en-US", { timeZone: env.REPORT_TIMEZONE })}` }],
  });
  return blocks;
}

export async function postReportToSlack(input: SlackPostInput): Promise<SlackPostResult> {
  const channelId = input.channelId || env.SLACK_CHANNEL_ID;
  const slack = client();
  if (!slack) {
    return { ok: false, channelId, error: "SLACK_BOT_TOKEN not configured" };
  }
  if (!channelId) {
    return { ok: false, channelId: "", error: "SLACK_CHANNEL_ID not configured" };
  }

  try {
    const res = await slack.chat.postMessage({
      channel: channelId,
      text: input.title, // fallback for notifications
      blocks: buildBlocks(input) as never,
      unfurl_links: false,
    });

    let permalink: string | undefined;
    if (res.ts) {
      try {
        const link = await slack.chat.getPermalink({ channel: channelId, message_ts: res.ts });
        permalink = link.permalink as string;
      } catch {
        // permalink is best-effort
      }
    }

    return { ok: true, channelId, ts: res.ts as string, permalink };
  } catch (err) {
    return { ok: false, channelId, error: (err as Error).message };
  }
}

/** Connection test: verifies token via auth.test. */
export async function testSlackConnection(): Promise<{ ok: boolean; detail: string }> {
  const slack = client();
  if (!slack) return { ok: false, detail: "SLACK_BOT_TOKEN not set" };
  try {
    const res = await slack.auth.test();
    return { ok: true, detail: `${res.team ?? ""} as ${res.user ?? ""}`.trim() || "authenticated" };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
