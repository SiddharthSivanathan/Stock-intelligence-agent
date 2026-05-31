import { useState } from 'react';
import { motion } from 'framer-motion';
import { BellRing, Trash2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAlertEvents,
  useAlertRules,
  useCreateAlert,
  useDeleteAlert,
  useUpdateAlert,
  type AlertRule,
} from '@/hooks/api/useAlerts';
import { useStreamStore } from '@/stores/stream';
import { toast } from '@/stores/toast';
import { fmtPct } from '@/lib/utils';

export default function Alerts() {
  const { data: rules = [], isLoading } = useAlertRules();
  const { data: events = [] } = useAlertEvents(30);
  const liveAlerts = useStreamStore((s) => s.recentAlerts);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BellRing className="h-5 w-5 text-accent" />
          Alerts
        </h1>
        <p className="text-sm text-muted mt-1">
          Rules fire when a symbol moves past a threshold. WebSocket pushes
          a toast in real time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Active rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CreateAlertForm />
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : rules.length === 0 ? (
              <p className="text-sm text-muted">No rules yet. Add one above.</p>
            ) : (
              <div className="space-y-2">
                {rules.map((r) => (
                  <RuleRow key={r.id} rule={r} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {liveAlerts.length === 0 ? (
              <p className="text-sm text-muted">Waiting for triggers…</p>
            ) : (
              <ul className="space-y-2">
                {liveAlerts.slice(0, 8).map((a, i) => (
                  <motion.li
                    key={`${a.rule_id}-${a.fired_at}-${i}`}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-sm flex items-start gap-2"
                  >
                    <Badge variant="warning" className="font-mono">
                      {a.symbol}
                    </Badge>
                    <span className="flex-1">{a.message}</span>
                  </motion.li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted">No events yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted border-b border-border">
                  <tr>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Symbol</th>
                    <th className="py-2 pr-3 font-medium">Price</th>
                    <th className="py-2 pr-3 font-medium">Change</th>
                    <th className="py-2 pr-3 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 text-muted text-xs font-mono">
                        {new Date(e.fired_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 font-mono font-semibold">
                        {e.symbol}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {e.price_at_fire?.toFixed(2) ?? '—'}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {e.change_pct_at_fire !== null && e.change_pct_at_fire !== undefined
                          ? fmtPct(e.change_pct_at_fire)
                          : '—'}
                      </td>
                      <td className="py-2 pr-3 text-text/80">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateAlertForm() {
  const [symbol, setSymbol] = useState('');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [threshold, setThreshold] = useState('3');
  const [cooldown, setCooldown] = useState('3600');
  const [reRun, setReRun] = useState(false);
  const [email, setEmail] = useState(false);
  const create = useCreateAlert();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = parseFloat(threshold);
    if (!symbol.trim() || !Number.isFinite(t)) return;
    try {
      await create.mutateAsync({
        symbol: symbol.trim().toUpperCase(),
        direction,
        threshold: t,
        cooldown_seconds: Math.max(10, Number(cooldown) || 3600),
        notify_via_email: email,
        re_run_analysis: reRun,
      });
      toast('success', 'Rule created');
      setSymbol('');
    } catch {
      toast('error', 'Could not create rule');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_1fr_auto] gap-2 items-center bg-panel-2/30 border border-border rounded-md p-3"
    >
      <Input
        value={symbol}
        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        placeholder="Symbol (AAPL)"
        className="uppercase h-9"
      />
      <Select
        value={direction}
        onChange={(e) => setDirection(e.target.value as 'above' | 'below')}
        className="h-9"
      >
        <option value="above">moves above</option>
        <option value="below">moves below</option>
      </Select>
      <Input
        value={threshold}
        onChange={(e) => setThreshold(e.target.value)}
        placeholder="3 (% change)"
        className="h-9"
      />
      <Input
        value={cooldown}
        onChange={(e) => setCooldown(e.target.value)}
        placeholder="3600s cooldown"
        className="h-9"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-muted whitespace-nowrap">
          <Switch checked={email} onCheckedChange={setEmail} aria-label="Notify via email" />
          Email
        </label>
        <label className="flex items-center gap-2 text-xs text-muted whitespace-nowrap">
          <Switch checked={reRun} onCheckedChange={setReRun} aria-label="Re-run analysis" />
          Re-analyze
        </label>
        <Button type="submit" size="sm" disabled={create.isPending}>
          Add rule
        </Button>
      </div>
    </form>
  );
}

function RuleRow({ rule }: { rule: AlertRule }) {
  const update = useUpdateAlert();
  const del = useDeleteAlert();

  async function toggle(next: boolean) {
    try {
      await update.mutateAsync({ id: rule.id, body: { is_active: next } });
    } catch {
      toast('error', 'Toggle failed');
    }
  }

  async function onDelete() {
    if (!confirm(`Delete rule for ${rule.symbol}?`)) return;
    try {
      await del.mutateAsync(rule.id);
      toast('success', 'Rule deleted');
    } catch {
      toast('error', 'Delete failed');
    }
  }

  return (
    <div className="flex items-center gap-3 border border-border rounded-md px-3 py-2 bg-panel-2/30">
      <Switch
        checked={rule.is_active}
        onCheckedChange={toggle}
        aria-label="Active"
      />
      <Badge variant="default" className="font-mono">
        {rule.symbol}
      </Badge>
      <span className="text-sm flex-1">
        when % change goes{' '}
        <span className="text-text font-semibold">{rule.direction}</span>{' '}
        <span className="font-mono">{rule.threshold}%</span>
      </span>
      <div className="text-xs text-muted hidden sm:flex items-center gap-3">
        <span>cooldown {rule.cooldown_seconds}s</span>
        {rule.re_run_analysis && (
          <Badge variant="warning" className="text-[10px]">
            auto-analyze
          </Badge>
        )}
        {rule.last_triggered_at && (
          <span>
            last {new Date(rule.last_triggered_at).toLocaleTimeString()}
          </span>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
