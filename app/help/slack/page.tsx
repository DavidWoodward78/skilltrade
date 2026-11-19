import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Connect Slack · SkillTrade",
  description: "How community admins connect SkillTrade to Slack, and what members see.",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-stone-700">{children}</div>
    </Card>
  );
}

export default function SlackHelp() {
  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <Link href="/"><Logo /></Link>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Connect Slack</h1>
      <p className="mt-1 text-sm text-stone-500">For community admins. Takes about two minutes.</p>

      <Section title="What it does">
        <p>Your members get SkillTrade without leaving Slack:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>When someone wants to trade with a member, the SkillTrade bot DMs them who it is, what they offer and what they need, with <b>Interested</b> and <b>Pass</b> buttons.</li>
          <li>If both are interested, the bot opens a group DM with the two of them and a link to agree trade terms.</li>
          <li>If someone passes, nobody is told.</li>
          <li>Members can sign in to SkillTrade with their Slack account.</li>
        </ul>
        <p>Profiles, trade terms, deliveries and reputation stay in SkillTrade.</p>
      </Section>

      <Section title="Before you start">
        <ul className="list-disc space-y-1 pl-5">
          <li>Slack is included on the <b>Growth</b> and <b>Enterprise</b> plans, and during your free trial.</li>
          <li>You need to be an admin of your SkillTrade community.</li>
          <li>
            Some Slack workspaces only let Slack admins add apps. If yours does, Slack will offer to send a request to your Slack
            admin when you click Add to Slack. Once they approve it, click Add to Slack again.
          </li>
          <li>One Slack workspace connects to one SkillTrade community.</li>
        </ul>
      </Section>

      <Section title="Connect it">
        <ol className="list-decimal space-y-1 pl-5">
          <li>In SkillTrade, open your community and tap <b>Admin</b>.</li>
          <li>In the <b>Slack</b> section, tap <b>Add to Slack</b>.</li>
          <li>Pick your community&apos;s Slack workspace (top right of the Slack page) and tap <b>Allow</b>.</li>
          <li>You&apos;re back in SkillTrade, and the Slack section shows your workspace as connected.</li>
        </ol>
        <p>Then let members know. A message like this works:</p>
        <blockquote className="rounded-xl bg-stone-50 p-3 text-stone-600">
          We&apos;ve connected SkillTrade to Slack. You&apos;ll get a DM from the SkillTrade app when someone wants to trade skills with
          you. Use the same email in SkillTrade as in Slack, or sign in to SkillTrade with Slack, so we can find you.
        </blockquote>
      </Section>

      <Section title="How members are found in Slack">
        <p>
          A member gets DMs if they signed in to SkillTrade with Slack, or if their SkillTrade email matches their email in your
          Slack workspace. Members whose emails differ won&apos;t get DMs, but everything still works in SkillTrade.
        </p>
        <p>
          New people who sign in with Slack join your community automatically, or land as a join request if you approve new
          members (the default).
        </p>
      </Section>

      <Section title="What SkillTrade can and can't see in Slack">
        <p>SkillTrade can send and update its own DMs, and look up members of your community by email so it can message them.</p>
        <p>It can&apos;t read your channels or anyone&apos;s messages, and it doesn&apos;t post in channels.</p>
      </Section>

      <Section title="Disconnecting">
        <p>
          Tap <b>Disconnect Slack</b> in Admin, or remove the SkillTrade app from your Slack workspace settings. DMs stop right
          away. Nothing in SkillTrade is deleted.
        </p>
        <p>If your plan changes to one without Slack, DMs pause and resume when you upgrade again.</p>
      </Section>

      <Section title="Something not working?">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>A member isn&apos;t getting DMs:</b> check their SkillTrade email matches their Slack email, or ask them to sign in to SkillTrade with Slack once.</li>
          <li><b>&ldquo;Already connected to another community&rdquo;:</b> that workspace is linked elsewhere. Disconnect it there first.</li>
          <li><b>No Add to Slack button:</b> your plan doesn&apos;t include Slack yet; see Plan and billing in Admin.</li>
          <li><b>Buttons in an old DM do nothing:</b> the request was withdrawn or already answered. Check SkillTrade for the latest.</li>
        </ul>
      </Section>
    </main>
  );
}
