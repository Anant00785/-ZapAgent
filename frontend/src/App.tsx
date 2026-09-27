import { useState, useEffect } from 'react';
import {
  Zap,
  Cpu,
  Radio,
  Wallet,
  Terminal,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Loader2,
  Copy,
  Code2,
  Send,
  Shield,
  Activity,
  Globe,
  Clock,
  Hash,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────
interface AgentStatus {
  status: string;
  agent_name: string;
  ai_model: string;
  identity: { npub: string; pubkey_hex: string; active_relays: string[] };
  wallet: {
    balance_sats: number;
    sats_earned: number;
    sats_spent: number;
    is_nwc_connected: boolean;
    wallet_pubkey: string;
  };
  relays: string[];
}

interface TelemetryEvent {
  type: string;
  prompt?: string;
  ai_result?: {
    thought_trace: string[];
    result: string;
    cost_sats: number;
    model_used: string;
  };
  nostr_event?: { id: string; pubkey: string; sig: string };
  relays_hit?: string[];
  timestamp?: number;
}

// ─── Helpers ────────────────────────────────────────────────
const cn = (...classes: (string | false | undefined)[]) =>
  classes.filter(Boolean).join(' ');

const formatSats = (n: number) => n.toLocaleString('en-US');

// ─── Main App ───────────────────────────────────────────────
export default function App() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TelemetryEvent | null>(null);
  const [feed, setFeed] = useState<TelemetryEvent[]>([]);
  const [copied, setCopied] = useState(false);

  // Poll status
  useEffect(() => {
    const f = async () => {
      try {
        const r = await fetch('http://localhost:8000/api/status');
        if (r.ok) setStatus(await r.json());
      } catch { /* backend offline */ }
    };
    f();
    const id = setInterval(f, 5000);
    return () => clearInterval(id);
  }, []);

  // WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('ws://localhost:8000/ws');
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data) as TelemetryEvent;
        if (d.type === 'job_completed') {
          setResult(d);
          setIsLoading(false);
        }
        setFeed((p) => [d, ...p.slice(0, 20)]);
      };
    } catch { /* ws offline */ }
    return () => ws?.close();
  }, []);

  const execute = async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setResult(null);
    try {
      const r = await fetch('http://localhost:8000/api/task/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, task_type: 'general', amount_sats: 21 }),
      });
      if (r.ok) setResult(await r.json());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(status?.identity?.pubkey_hex || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const presets = [
    { icon: '⚡', label: 'Lightning Routing', q: 'Analyze optimal routing fee and channel rebalancing strategies for a high-volume Lightning Routing Node.' },
    { icon: '🔐', label: 'Silent Payments', q: 'Explain how BIP-352 Silent Payments prevent UTXO clustering by generating unique one-time addresses.' },
    { icon: '📡', label: 'NIP-90 Lifecycle', q: 'Break down the NIP-90 Data Vending Machine lifecycle: Request (Kind 5000) to Result (Kind 6000) with Lightning Zaps.' },
    { icon: '🤖', label: 'Agent Design', q: 'Draft a system architecture for an AI Agent that self-finances compute via L402 HTTP micropayments.' },
  ];

  const balance = status?.wallet?.balance_sats ?? 21000;
  const earned = status?.wallet?.sats_earned ?? 0;
  const spent = status?.wallet?.sats_spent ?? 0;
  const npub = status?.identity?.npub ?? 'npub1...generating';

  return (
    <div className="min-h-screen bg-surface-0 text-text-primary">

      {/* ━━━ Topbar ━━━ */}
      <nav className="sticky top-0 z-50 bg-surface-0/80 backdrop-blur-xl border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-bitcoin/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-bitcoin" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight">ZapAgent</span>
            <span className="text-[10px] font-medium text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">v1.0</span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-success live-dot" />
              <span>4 relays</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5 text-xs font-medium text-bitcoin">
              <Wallet className="w-3.5 h-3.5" />
              <span>{formatSats(balance)} sats</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Cpu className="w-3.5 h-3.5 text-nostr" />
              <span>Gemini 1.5</span>
            </div>
          </div>
        </div>
      </nav>

      {/* ━━━ Main Content ━━━ */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Identity + Stats Row ── */}
        <div className="grid grid-cols-4 gap-3">
          {/* Identity Card */}
          <div className="col-span-1 bg-surface-1 rounded-xl p-4 border border-border-subtle">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Nostr Identity</span>
              <button onClick={copyKey} className="text-text-muted hover:text-text-primary transition">
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="font-mono text-xs text-nostr truncate">{npub}</p>
          </div>

          {/* Earned */}
          <div className="bg-surface-1 rounded-xl p-4 border border-border-subtle">
            <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Earned</span>
            <div className="flex items-center gap-1.5 mt-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-success" />
              <span className="text-lg font-semibold text-success tabular-nums">+{formatSats(earned)}</span>
              <span className="text-xs text-text-muted">sats</span>
            </div>
          </div>

          {/* Spent */}
          <div className="bg-surface-1 rounded-xl p-4 border border-border-subtle">
            <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Compute Spent</span>
            <div className="flex items-center gap-1.5 mt-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-cyan" />
              <span className="text-lg font-semibold text-cyan tabular-nums">-{formatSats(spent)}</span>
              <span className="text-xs text-text-muted">sats</span>
            </div>
          </div>

          {/* Sovereignty */}
          <div className="bg-surface-1 rounded-xl p-4 border border-border-subtle">
            <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Status</span>
            <div className="flex items-center gap-1.5 mt-1">
              <Shield className="w-3.5 h-3.5 text-success" />
              <span className="text-sm font-medium text-success">Sovereign</span>
            </div>
            <p className="text-[10px] text-text-muted mt-0.5">No KYC · No middlemen</p>
          </div>
        </div>

        {/* ── Main 2-Column Grid ── */}
        <div className="grid grid-cols-12 gap-5">

          {/* ─── LEFT: Input Panel (5 cols) ─── */}
          <div className="col-span-5 space-y-4">

            {/* Prompt card */}
            <div className="bg-surface-1 rounded-xl border border-border-subtle overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-text-muted" />
                  <span className="text-sm font-medium">New Task</span>
                </div>
                <span className="text-[11px] font-mono text-bitcoin bg-bitcoin/8 px-2 py-0.5 rounded-full">21 sats/job</span>
              </div>

              {/* Presets */}
              <div className="px-4 pt-3 pb-1">
                <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2">Quick actions</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {presets.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(p.q)}
                      className={cn(
                        'text-left px-3 py-2 rounded-lg text-xs transition-all duration-150',
                        'bg-surface-2 hover:bg-surface-3 border border-transparent hover:border-border',
                        prompt === p.q && 'border-bitcoin/40 bg-bitcoin/5'
                      )}
                    >
                      <span className="mr-1">{p.icon}</span>
                      <span className="text-text-secondary font-medium">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <div className="px-4 py-3">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="Describe a task for ZapAgent..."
                  className="w-full bg-surface-0 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/20 transition"
                />
              </div>

              {/* Submit */}
              <div className="px-4 pb-4">
                <button
                  onClick={execute}
                  disabled={isLoading || !prompt.trim()}
                  className={cn(
                    'w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200',
                    isLoading
                      ? 'bg-surface-3 text-text-secondary cursor-wait'
                      : 'bg-bitcoin hover:bg-bitcoin-dark text-surface-0 cursor-pointer shadow-lg shadow-bitcoin/10 active:scale-[0.98]',
                    (!prompt.trim() && !isLoading) && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /><span>Processing...</span></>
                  ) : (
                    <><Send className="w-4 h-4" /><span>Execute Task</span></>
                  )}
                </button>
              </div>
            </div>

            {/* Protocol info */}
            <div className="bg-surface-1 rounded-xl p-4 border border-border-subtle space-y-3">
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Protocol Flow</p>
              {[
                { icon: Globe, text: 'Receives NIP-90 job request from Nostr relays', color: 'text-nostr' },
                { icon: Zap, text: 'Creates Lightning invoice via NWC (NIP-47)', color: 'text-bitcoin' },
                { icon: Cpu, text: 'Executes multi-step reasoning with Gemini', color: 'text-cyan' },
                { icon: Radio, text: 'Signs & publishes result (Kind 6000) to relays', color: 'text-success' },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className={cn('w-6 h-6 rounded-md bg-surface-2 flex items-center justify-center flex-shrink-0 mt-0.5')}>
                    <step.icon className={cn('w-3 h-3', step.color)} />
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary leading-relaxed">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── RIGHT: Output Panel (7 cols) ─── */}
          <div className="col-span-7 space-y-4">

            {/* Result Card */}
            <div className="bg-surface-1 rounded-xl border border-border-subtle overflow-hidden min-h-[420px] flex flex-col">
              {/* Header */}
              <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-text-muted" />
                  <span className="text-sm font-medium">Output</span>
                </div>
                {result?.nostr_event && (
                  <div className="flex items-center gap-1.5 text-[11px] text-success font-mono">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Signed</span>
                  </div>
                )}
              </div>

              {result ? (
                <div className="flex-1 flex flex-col animate-fade-up">
                  {/* Thought trace */}
                  {result.ai_result?.thought_trace && (
                    <div className="px-4 pt-4 pb-2">
                      <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2">Reasoning Steps</p>
                      <div className="space-y-1">
                        {result.ai_result.thought_trace.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-text-secondary">
                            <div className="w-4 h-4 rounded bg-surface-2 flex items-center justify-center text-[10px] text-text-muted font-mono flex-shrink-0">
                              {i + 1}
                            </div>
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="mx-4 border-t border-border-subtle" />

                  {/* Main output */}
                  <div className="flex-1 px-4 py-3 overflow-y-auto max-h-[280px]">
                    <pre className="text-[13px] text-text-secondary font-sans leading-relaxed whitespace-pre-wrap">
                      {result.ai_result?.result}
                    </pre>
                  </div>

                  {/* Footer proof */}
                  {result.nostr_event && (
                    <div className="px-4 py-2.5 border-t border-border-subtle bg-surface-0/50 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted">
                        <Hash className="w-3 h-3" />
                        <span>{result.nostr_event.id.slice(0, 24)}...</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-mono text-text-muted">
                        <span className="text-bitcoin">{result.ai_result?.cost_sats} sats</span>
                        <span>{result.relays_hit?.length ?? 0} relays</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Empty state */
                <div className="flex-1 flex flex-col items-center justify-center p-10">
                  <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                    <Code2 className="w-6 h-6 text-text-muted" />
                  </div>
                  <p className="text-sm font-medium text-text-secondary mb-1">No task dispatched yet</p>
                  <p className="text-xs text-text-muted text-center max-w-[260px]">
                    Select a quick action or type a custom prompt to see ZapAgent reason, pay, and publish in real-time.
                  </p>
                </div>
              )}
            </div>

            {/* Live Feed */}
            <div className="bg-surface-1 rounded-xl border border-border-subtle overflow-hidden">
              <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-bitcoin" />
                  <span className="text-sm font-medium">Network Feed</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-success live-dot" />
                  <span className="font-mono">live</span>
                </div>
              </div>

              <div className="max-h-[140px] overflow-y-auto">
                {feed.length > 0 ? (
                  feed.map((ev, i) => (
                    <div key={i} className="px-4 py-2 border-b border-border-subtle last:border-0 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {ev.type === 'job_completed' ? (
                          <Zap className="w-3 h-3 text-bitcoin" />
                        ) : (
                          <ArrowDownLeft className="w-3 h-3 text-success" />
                        )}
                        <span className="text-xs text-text-secondary">
                          {ev.type === 'job_completed' ? 'NIP-90 Result Published' : 'Zap Settled'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted">
                        <Clock className="w-3 h-3" />
                        <span>{new Date().toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs text-text-muted font-mono cursor-blink">
                      Listening on wss://relay.damus.io
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
