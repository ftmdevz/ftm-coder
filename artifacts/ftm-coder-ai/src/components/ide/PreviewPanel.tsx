import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  RefreshCw, ExternalLink, X, Globe, AlertCircle,
  Smartphone, Tablet, Monitor, Scan, Loader2, Wifi
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DeviceMode = "mobile" | "tablet" | "desktop";
type Status = "idle" | "loading" | "loaded" | "error";

interface PortScanResult {
  ports: number[];
}

const DEVICE_CONFIG: Record<DeviceMode, { label: string; width: number | null; icon: React.ReactNode }> = {
  mobile:  { label: "Mobile",  width: 375,  icon: <Smartphone className="h-3 w-3" /> },
  tablet:  { label: "Tablet",  width: 768,  icon: <Tablet     className="h-3 w-3" /> },
  desktop: { label: "Desktop", width: null, icon: <Monitor    className="h-3 w-3" /> },
};

const QUICK_PORTS = [3000, 3001, 4000, 5000, 5173, 8000, 8080];

type Props = {
  onClose: () => void;
};

export function PreviewPanel({ onClose }: Props) {
  const [port, setPort] = useState(3000);
  const [portInput, setPortInput] = useState("3000");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [key, setKey] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [scanning, setScanning] = useState(false);
  const [openPorts, setOpenPorts] = useState<number[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewUrl = `/api/preview/${port}/`;

  // Auto-scan on first open
  useEffect(() => {
    if (!hasScanned) handleScan();
  }, []);

  const handleScan = useCallback(async () => {
    setScanning(true);
    try {
      const r = await fetch("/api/preview/scan");
      const data = (await r.json()) as PortScanResult;
      setOpenPorts(data.ports ?? []);
      setHasScanned(true);
      // Auto-open first detected port
      if (data.ports?.length > 0 && status === "idle") {
        const first = data.ports[0];
        setPort(first);
        setPortInput(String(first));
        setStatus("loading");
        setKey(k => k + 1);
      }
    } catch {
      setOpenPorts([]);
    } finally {
      setScanning(false);
    }
  }, [status]);

  const handleOpen = useCallback(() => {
    const p = parseInt(portInput, 10);
    if (isNaN(p) || p < 1024 || p > 65534) return;
    setPort(p);
    setStatus("loading");
    setKey(k => k + 1);
  }, [portInput]);

  const handleReload = () => {
    setStatus("loading");
    setKey(k => k + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleOpen();
  };

  const deviceWidth = DEVICE_CONFIG[device].width;

  return (
    <div className="h-full flex flex-col bg-[#0f0f17] border-l border-border">

      {/* ── Toolbar row 1: title + port input + controls ── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/60 bg-card/30 shrink-0 flex-wrap">
        <Globe className="h-3.5 w-3.5 text-primary/70 shrink-0" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
          Preview
        </span>

        {/* URL / port input */}
        <div className="flex items-center gap-1 ml-1 flex-1 min-w-0">
          <span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono">localhost:</span>
          <Input
            value={portInput}
            onChange={e => setPortInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-5 w-14 text-xs bg-background/60 border-border/60 font-mono px-1.5 text-center shrink-0"
            placeholder="3000"
          />
          <Button size="sm" variant="secondary" className="h-5 text-[10px] px-2 shrink-0" onClick={handleOpen}>
            Open
          </Button>
        </div>

        {/* Status */}
        <div className="flex items-center gap-0.5 ml-auto shrink-0">
          {status === "loading" && <span className="text-[9px] text-amber-400/70 animate-pulse">connecting…</span>}
          {status === "loaded"  && <span className="text-[9px] text-green-400/70 flex items-center gap-0.5"><Wifi className="h-2.5 w-2.5" /> live</span>}
          {status === "error"   && <span className="text-[9px] text-red-400/70 flex items-center gap-0.5"><AlertCircle className="h-2.5 w-2.5" /> offline</span>}

          <button onClick={handleReload} title="Reload" className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <RefreshCw className="h-3 w-3" />
          </button>
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" title="Open in new tab" className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <ExternalLink className="h-3 w-3" />
          </a>
          <button onClick={onClose} title="Close" className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ── Toolbar row 2: device mode + port scanner + quick ports ── */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border/40 bg-card/10 shrink-0 flex-wrap">
        {/* Device toggles */}
        <div className="flex items-center gap-0.5 bg-background/40 rounded p-0.5 border border-border/40">
          {(["mobile", "tablet", "desktop"] as DeviceMode[]).map(d => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              title={DEVICE_CONFIG[d].label}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                device === d
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {DEVICE_CONFIG[d].icon}
              <span className="hidden sm:inline">{DEVICE_CONFIG[d].label}</span>
            </button>
          ))}
        </div>

        <div className="h-3 w-px bg-border/40 mx-0.5" />

        {/* Port scanner */}
        <button
          onClick={handleScan}
          disabled={scanning}
          title="Auto-detect running servers"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-violet-600/15 text-violet-300 border border-violet-700/30 hover:bg-violet-600/25 transition-colors disabled:opacity-60"
        >
          {scanning ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Scan className="h-2.5 w-2.5" />}
          {scanning ? "Scanning…" : "Scan ports"}
        </button>

        {/* Detected open ports */}
        {openPorts.length > 0 && (
          <>
            <span className="text-[9px] text-green-400/60">Active:</span>
            {openPorts.map(p => (
              <button
                key={`open-${p}`}
                onClick={() => { setPortInput(String(p)); setPort(p); setStatus("loading"); setKey(k => k + 1); }}
                className={`text-[9px] px-1.5 py-0.5 rounded border font-mono transition-colors ${
                  p === port
                    ? "bg-green-600/20 border-green-600/50 text-green-300"
                    : "bg-green-900/20 border-green-800/40 text-green-400/80 hover:border-green-600/40"
                }`}
              >
                {p}
              </button>
            ))}
          </>
        )}

        {/* Quick port chips (not already in open ports) */}
        {hasScanned && (
          <>
            <div className="h-3 w-px bg-border/40 mx-0.5" />
            <span className="text-[9px] text-muted-foreground/50">Common:</span>
          </>
        )}
        {QUICK_PORTS.filter(p => !openPorts.includes(p)).map(p => (
          <button
            key={p}
            onClick={() => { setPortInput(String(p)); setPort(p); setStatus("loading"); setKey(k => k + 1); }}
            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors font-mono ${
              p === port && !openPorts.includes(p)
                ? "bg-primary/20 border-primary/50 text-primary"
                : "bg-background/40 border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* ── Preview area ── */}
      {status === "idle" ? (
        /* Welcome / empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center overflow-auto">
          <Globe className="h-10 w-10 text-muted-foreground/30" />
          <div>
            <p className="text-sm text-foreground/70 font-medium mb-1">Live Preview</p>
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              Run a web server in the terminal, then press <strong>Scan ports</strong> or click <strong>Open</strong> to preview.
            </p>
          </div>

          {/* Quick-start commands */}
          <div className="text-left w-full max-w-xs space-y-2">
            {[
              ["Python",  "python -m http.server 3000"],
              ["Node.js", "node app.js  # listen on 3000"],
              ["Vite",    "npx vite --port 3000"],
              ["FastAPI", "uvicorn main:app --port 3000"],
              ["Flask",   "flask run --port 3000"],
            ].map(([label, cmd]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide font-semibold">{label}</span>
                <code className="text-[10px] bg-background/60 px-2 py-1 rounded text-amber-300/80 font-mono">{cmd}</code>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-1">
            <Button size="sm" variant="outline" onClick={handleScan} disabled={scanning} className="gap-1.5">
              {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scan className="h-3 w-3" />}
              Scan for servers
            </Button>
            <Button size="sm" onClick={() => { setStatus("loading"); setKey(k => k + 1); }}>
              Preview port {port}
            </Button>
          </div>
        </div>
      ) : (
        /* iframe with device frame */
        <div className="flex-1 relative overflow-hidden bg-[#0a0a12]">
          {deviceWidth ? (
            /* Device frame mode (mobile / tablet) */
            <div className="absolute inset-0 flex items-start justify-center pt-2 overflow-auto">
              <div
                style={{ width: deviceWidth, minHeight: "100%" }}
                className="relative flex flex-col bg-background shadow-2xl border border-border/40 rounded-lg overflow-hidden"
              >
                {/* Fake browser chrome */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-card/80 border-b border-border/40 shrink-0">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500/60" />
                    <span className="h-2 w-2 rounded-full bg-yellow-500/60" />
                    <span className="h-2 w-2 rounded-full bg-green-500/60" />
                  </div>
                  <div className="flex-1 bg-background/60 rounded px-2 py-0.5 text-[9px] text-muted-foreground/60 font-mono truncate">
                    localhost:{port}
                  </div>
                </div>
                <iframe
                  key={key}
                  ref={iframeRef}
                  src={previewUrl}
                  className="flex-1 border-0 w-full"
                  style={{ minHeight: device === "mobile" ? 667 : 1024 }}
                  title={`Preview :${port} (${device})`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  onLoad={() => setStatus("loaded")}
                  onError={() => setStatus("error")}
                />
              </div>
            </div>
          ) : (
            /* Desktop: full width */
            <iframe
              key={key}
              ref={iframeRef}
              src={previewUrl}
              className="absolute inset-0 w-full h-full border-0"
              title={`Preview :${port}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              onLoad={() => setStatus("loaded")}
              onError={() => setStatus("error")}
            />
          )}

          {/* Loading overlay */}
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0f0f17]/80 pointer-events-none">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                <span className="text-xs text-muted-foreground">Connecting to port {port}…</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
