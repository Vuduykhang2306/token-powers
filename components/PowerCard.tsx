import type { Power, Verdict } from "@/lib/powers";

const STYLE: Record<Verdict, { bar: string; label: string; text: string }> = {
  safe: { bar: "bg-safe", label: "no risk", text: "text-safe" },
  warn: { bar: "bg-warn", label: "worth knowing", text: "text-warn" },
  risk: { bar: "bg-risk", label: "you are exposed", text: "text-risk" },
  unknown: { bar: "bg-muted", label: "cannot tell", text: "text-muted" },
};

export function PowerCard({ power }: { power: Power }) {
  const s = STYLE[power.verdict];
  return (
    <div className="flex gap-3 rounded-lg border border-edge bg-panel p-4">
      <div className={`w-1 shrink-0 rounded-full ${s.bar}`} aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-semibold">{power.title}</h3>
          <span className={`text-xs uppercase tracking-wide ${s.text}`}>{s.label}</span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-[#c3c9d6]">{power.detail}</p>
        <p className="hash mt-2 font-mono text-xs text-muted">{power.evidence}</p>
      </div>
    </div>
  );
}
