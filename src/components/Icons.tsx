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

export const IcBrand = s(<><path d="M3 6.5 8 2.5l5 4V13a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 13z" /><path d="M6.5 13.5v-4h3v4" /></>);
export const IcCreate = s(<><path d="M8 3.5v9M3.5 8h9" /><circle cx="8" cy="8" r="6.2" /></>);
export const IcBoard = s(<><rect x="2.5" y="3" width="3" height="10" rx="1" /><rect x="6.5" y="3" width="3" height="7" rx="1" /><rect x="10.5" y="3" width="3" height="5" rx="1" /></>);
export const IcLibrary = s(<><path d="M2.5 4.5h4l1.2 1.5h5.8v6.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" /></>);
export const IcResults = s(<><path d="M2.5 13.5h11" /><path d="M3.5 4c1.5 0 2 5 4 6.2 1.8 1 4 1.3 5.5 1.3" /><circle cx="6" cy="8.2" r="1" fill="currentColor" /></>);
export const IcBack = s(<path d="M13 8H3.5M7.5 4 3.5 8l4 4" />);
export const IcPencil = s(<path d="M10.5 2.8 13.2 5.5 6 12.7l-3.2.5.5-3.2z" />);
export const IcBulb = s(<><path d="M6 12.5h4M6.5 14.5h3" /><path d="M8 1.8a4.2 4.2 0 0 0-2.6 7.5c.5.4.8 1 .8 1.7v.5h3.6V11c0-.7.3-1.3.8-1.7A4.2 4.2 0 0 0 8 1.8z" /></>);
export const IcArrow = s(<path d="M3 8h9.5M8.5 4l4 4-4 4" />);
export const IcLink = s(<><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.7.7" /><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.7-.7" /></>);
export const IcChat = s(<path d="M2.5 4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 4v5.5A1.5 1.5 0 0 1 12 11H7l-3 2.5V11H4A1.5 1.5 0 0 1 2.5 9.5z" />);
export const IcDown = s(<path d="M8 3v8.5M4.5 8 8 11.5 11.5 8M3 13.5h10" />);
