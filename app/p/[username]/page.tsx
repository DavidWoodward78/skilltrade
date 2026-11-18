import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/constants";
import { PortfolioView, type Portfolio } from "@/components/PortfolioView";

const load = cache(async (username: string) => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_portfolio", { p_username: username });
  return (data as Portfolio | null) ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const p = await load(username);
  if (!p) return { title: `Not found · ${APP_NAME}` };
  const n = p.stats?.trades_completed ?? 0;
  const description = `${p.headline ? p.headline + " · " : ""}${n} verified trade${n === 1 ? "" : "s"} completed on ${APP_NAME}.`;
  return {
    title: `${p.name} · ${APP_NAME} portfolio`,
    description,
    openGraph: {
      title: `${p.name} — verified skill trades`,
      description,
      type: "profile",
      images: p.avatar_url ? [{ url: p.avatar_url, width: 512, height: 512 }] : undefined,
    },
    twitter: { card: "summary", title: `${p.name} — verified skill trades`, description },
  };
}

export default async function PublicPortfolio({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const p = await load(username);
  if (!p) notFound();
  return <PortfolioView p={p} />;
}
