import { pct } from "./ui";

export type Rep = {
  trades_completed: number;
  trades_accepted: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  avg_rating: number | null;
  review_count: number;
  cancellations: number;
  incompletes: number;
  unique_partners: number;
};

export const EMPTY_REP: Rep = {
  trades_completed: 0, trades_accepted: 0, completion_rate: null, on_time_rate: null,
  avg_rating: null, review_count: 0, cancellations: 0, incompletes: 0, unique_partners: 0,
};

export function Reputation({ rep }: { rep: Rep | null }) {
  const r = rep ?? EMPTY_REP;
  const stats = [
    { label: r.unique_partners === 1 ? "1 partner" : `${r.unique_partners} partners`, value: String(r.trades_completed), sub: "Completed" },
    { label: "Completion", value: pct(r.completion_rate) },
    { label: "On time", value: pct(r.on_time_rate) },
    { label: r.review_count ? `${r.review_count} reviews` : "Rating", value: r.avg_rating ? `${r.avg_rating}★` : "—" },
  ];
  const problems = [
    r.incompletes > 0 && `didn't deliver on ${r.incompletes} trade${r.incompletes > 1 ? "s" : ""}`,
    r.cancellations > 0 && `cancelled ${r.cancellations} accepted trade${r.cancellations > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-stone-50 p-2">
            <p className="text-base font-semibold">{s.value}</p>
            <p className="text-[11px] leading-tight text-stone-500">{s.sub ? <>{s.sub}<br />{s.label}</> : s.label}</p>
          </div>
        ))}
      </div>
      {r.trades_completed === 0 && <p className="mt-2 text-xs text-stone-500">New here: no completed trades yet.</p>}
      {problems.length > 0 && <p className="mt-2 text-xs text-rose-700">Has {problems.join(" and ")}.</p>}
    </div>
  );
}

/** Shown before someone commits to a trade with a member who has no track record. */
export function NewMemberWarning({ name, rep }: { name: string; rep: Rep | null }) {
  const r = rep ?? EMPTY_REP;
  if (r.trades_completed > 0 && !r.incompletes) return null;
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {r.trades_completed === 0 ? (
        <>
          <p className="font-semibold">{name} hasn&apos;t completed a trade yet</p>
          <p className="mt-0.5">Start small: add a first milestone each, and take turns delivering so nobody hands over all their work up front.</p>
        </>
      ) : (
        <>
          <p className="font-semibold">{name} didn&apos;t deliver on {r.incompletes} past trade{r.incompletes > 1 ? "s" : ""}</p>
          <p className="mt-0.5">Use small milestones and take turns delivering.</p>
        </>
      )}
    </div>
  );
}
