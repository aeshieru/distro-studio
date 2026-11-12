// Step-by-step progress for anything slow: each step shows done, working (with a live
// timer and detail), or waiting, so nobody stares at a spinner.
import { useEffect, useState } from "react";
import { Check, Cross } from "./Icons";

export type StepState = "todo" | "now" | "done" | "fail";
export type ProgressStep = { id: string; label: string; state: StepState; detail?: string; startedAt?: number; tookMs?: number };

export function useSteps(initial: { id: string; label: string }[] = []) {
  const [steps, setSteps] = useState<ProgressStep[]>(() => initial.map((s) => ({ ...s, state: "todo" as StepState })));
  const reset = (list: { id: string; label: string }[]) => setSteps(list.map((s) => ({ ...s, state: "todo" })));
  const update = (id: string, state: StepState, detail?: string) =>
    setSteps((all) => all.map((s) => {
      if (s.id !== id) return s;
      const now = Date.now();
      return {
        ...s, state, detail: detail ?? s.detail,
        startedAt: state === "now" ? s.startedAt ?? now : s.startedAt,
        tookMs: state === "done" && s.startedAt ? now - s.startedAt : s.tookMs,
      };
    }));
  const rename = (id: string, label: string) => setSteps((all) => all.map((s) => (s.id === id ? { ...s, label } : s)));
  // Marks whatever is still running as failed, so nothing spins after an error.
  const failNow = (detail?: string) => setSteps((all) => all.map((s) => (s.state === "now" ? { ...s, state: "fail", detail: detail ?? s.detail } : s)));
  return { steps, reset, update, rename, failNow };
}

function Elapsed({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, []);
  return <span className="pg-time">{Math.max(0, Math.round((Date.now() - since) / 1000))} s</span>;
}

export function Progress({ steps, title }: { steps: ProgressStep[]; title?: string }) {
  if (!steps.length) return null;
  const done = steps.filter((s) => s.state === "done").length;
  return (
    <div className="pg" role="status" aria-live="polite">
      {title && <div className="pg-head"><b>{title}</b><span>{done} of {steps.length}</span></div>}
      <div className="pg-bar"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol>
        {steps.map((s) => (
          <li key={s.id} className={`pg-step ${s.state}`}>
            <span className="pg-icon" aria-hidden="true">
              {s.state === "done" ? <Check /> : s.state === "fail" ? <Cross /> : s.state === "now" ? <span className="spinner" /> : null}
            </span>
            <span className="pg-text">
              <span className="pg-label">{s.label}</span>
              {s.detail && <span className="pg-detail">{s.detail}</span>}
            </span>
            {s.state === "now" && s.startedAt && <Elapsed since={s.startedAt} />}
            {s.state === "done" && s.tookMs != null && s.tookMs > 900 && <span className="pg-time">{(s.tookMs / 1000).toFixed(0)} s</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
