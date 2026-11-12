type P = { className?: string };
const s = (d: React.ReactNode) => ({ className = "i" }: P) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">{d}</svg>
);

export const Check = s(<polyline points="3,8.5 6.5,12 13,4.5" />);
export const Cross = s(<path d="M4 4l8 8M12 4l-8 8" />);
export const Info = s(<><circle cx="8" cy="8" r="6.2" /><path d="M8 7.5v4M8 4.8v.1" /></>);
export const Play = s(<path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />);
export const Pause = s(<path d="M5 3.5v9M11 3.5v9" />);
export const Upload = s(<path d="M8 11V3M4.5 6.5 8 3l3.5 3.5M3 13h10" />);
export const Spark = s(<path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2" />);
export const Copy = s(<><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6.5" /></>);
export const Clock = s(<><circle cx="8" cy="8" r="6.2" /><path d="M8 4.5V8l2.5 1.5" /></>);
export const Warn = s(<path d="M8 2.5 14 13H2zM8 6.5v3M8 11.3v.1" />);
export const Undo = s(<path d="M5.5 4 2.5 7l3 3M2.5 7H10a3.5 3.5 0 0 1 0 7H8" />);

export function StateIcon({ state }: { state: "pass" | "fail" | "warn" | "later" | "skip" }) {
  return (
    <span className={`st-icon ${state}`} aria-label={state}>
      {state === "pass" ? <Check /> : state === "fail" ? <Cross /> : state === "warn" ? <Warn /> : state === "later" ? <Clock /> : null}
    </span>
  );
}
