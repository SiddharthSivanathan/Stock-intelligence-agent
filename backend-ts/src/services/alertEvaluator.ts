/**
 * Alert evaluator. Runs after every producer tick.
 *
 * For every active rule whose symbol matches the tick:
 *   - check direction/threshold against change_percent
 *   - respect cooldown (last_triggered_at + cooldown_seconds)
 *   - persist an AlertEvent
 *   - fan out via WS hub if notify_via_ws
 *   - email if notify_via_email
 *   - kick off /agents/analyze if re_run_analysis
 */
import { prisma } from "../db.js";
import { sendAlert } from "./hub.js";
import { sendEmail } from "./notifier.js";
import { runWorkflow } from "../ai/workflow/graph.js";

interface Tick {
  symbol: string;
  price: number;
  change_percent: number;
  // Extra fields (change, previous_close, currency, timestamp) are tolerated
  // — producer sends a richer payload but the evaluator only reads these three.
  [key: string]: unknown;
}

export async function evaluateAlerts(tick: Tick) {
  const rules = await prisma.alertRule.findMany({
    where: { isActive: true, symbol: tick.symbol },
    include: { user: true },
  });
  if (!rules.length) return;

  const now = Date.now();

  for (const rule of rules) {
    const matched =
      rule.direction === "above"
        ? tick.change_percent >= rule.threshold
        : tick.change_percent <= -Math.abs(rule.threshold);
    if (!matched) continue;

    if (rule.lastTriggeredAt) {
      const since = (now - rule.lastTriggeredAt.getTime()) / 1000;
      if (since < rule.cooldownSeconds) continue;
    }

    const message =
      rule.direction === "above"
        ? `${tick.symbol} rose ${tick.change_percent.toFixed(2)}% (≥ ${rule.threshold}%)`
        : `${tick.symbol} fell ${tick.change_percent.toFixed(2)}% (≤ -${rule.threshold}%)`;

    const event = await prisma.alertEvent.create({
      data: {
        ruleId: rule.id,
        userId: rule.userId,
        symbol: tick.symbol,
        priceAtFire: tick.price,
        changePctAtFire: tick.change_percent,
        message,
        extra: { tick } as never,
      },
    });
    await prisma.alertRule.update({
      where: { id: rule.id },
      data: { lastTriggeredAt: new Date() },
    });

    if (rule.notifyViaWs) {
      sendAlert(rule.userId, {
        id: event.id,
        rule_id: rule.id,
        symbol: tick.symbol,
        message,
        price: tick.price,
        change_percent: tick.change_percent,
        fired_at: event.firedAt.toISOString(),
      });
    }
    if (rule.notifyViaEmail && rule.user.email) {
      void sendEmail(rule.user.email, `[Stock Alert] ${tick.symbol}`, message);
    }
    if (rule.reRunAnalysis) {
      void runWorkflow(tick.symbol, rule.userId).catch(() => undefined);
    }
  }
}
