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
  userIds?: string[];
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

function reportUserIds(input?: string): string[] {
  return (input ?? env.SLACK_REPORT_USER_IDS)
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
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
  const userIds = input.userIds ?? reportUserIds();
  const slack = client();
  if (!slack) {
    return { ok: false, channelId, error: "SLACK_BOT_TOKEN not configured" };
  }
  if (!channelId && userIds.length === 0) {
    return { ok: false, channelId: "", error: "SLACK_CHANNEL_ID not configured" };
  }
  const slackClient = slack;

  const posted: SlackPostResult[] = [];
  const failed: SlackPostResult[] = [];

  async function postToChannel(destChannelId: string): Promise<SlackPostResult> {
    const res = await slackClient.chat.postMessage({
      channel: destChannelId,
      text: input.title, // fallback for notifications
      blocks: buildBlocks(input) as never,
      unfurl_links: false,
    });

    let permalink: string | undefined;
    if (res.ts) {
      try {
        const link = await slackClient.chat.getPermalink({ channel: destChannelId, message_ts: res.ts });
        permalink = link.permalink as string;
      } catch {
        // permalink is best-effort
      }
    }

    return { ok: true, channelId: destChannelId, ts: res.ts as string, permalink };
  }

  async function postToUser(userId: string): Promise<SlackPostResult> {
    try {
      const dm = await slackClient.conversations.open({ users: userId });
      const dmChannelId = dm.channel?.id;
      if (!dmChannelId) throw new Error(`Could not open Slack DM for ${userId}`);
      return postToChannel(dmChannelId as string);
    } catch (err) {
      if (!(err as Error).message.includes("missing_scope")) throw err;
      return postToChannel(userId);
    }
  }

  try {
    if (channelId) posted.push(await postToChannel(channelId));
    for (const userId of userIds) {
      try {
        posted.push(await postToUser(userId));
      } catch (err) {
        failed.push({ ok: false, channelId: userId, error: (err as Error).message });
      }
    }

    if (failed.length > 0) {
      const primary = posted[0] ?? { channelId };
      return {
        ok: false,
        channelId: primary.channelId,
        ts: primary.ts,
        permalink: primary.permalink,
        error: failed.map((f) => `${f.channelId}: ${f.error}`).join("; "),
      };
    }

    return posted[0] ?? { ok: true, channelId };
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
