export const CATEGORIES = [
  "Development",
  "Design",
  "Marketing",
  "Copywriting",
  "SEO",
  "Sales",
  "Product",
  "Strategy",
  "Data",
  "Testing",
  "Video",
  "Other",
] as const;

export const LEVELS: Record<number, string> = { 1: "Learning", 2: "Solid", 3: "Expert" };

export type Skill = { category: string; skill: string; level: number };

export type Trade = {
  id: string;
  org_id: string;
  match_id: string;
  proposer_id: string;
  partner_id: string;
  proposer_gives: string;
  partner_gives: string;
  proposer_hours: number;
  partner_hours: number;
  due_date: string;
  definition_of_done: string;
  status: "proposed" | "active" | "completed" | "declined" | "cancelled" | "incomplete";
  proposer_delivery_confirmed_at: string | null;
  partner_delivery_confirmed_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  proposer_showcase: boolean;
  partner_showcase: boolean;
};

export const STATUS_STYLE: Record<Trade["status"], string> = {
  proposed: "bg-amber-100 text-amber-800",
  active: "bg-sky-100 text-sky-800",
  completed: "bg-emerald-100 text-emerald-800",
  declined: "bg-stone-200 text-stone-700",
  cancelled: "bg-rose-100 text-rose-800",
  incomplete: "bg-rose-100 text-rose-800",
};
export const APP_NAME = "SkillTrade"; // name pending: change it here
