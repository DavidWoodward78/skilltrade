"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { inputCls } from "@/components/ui";
import { Avatar } from "@/components/Avatar";

type Msg = { id: string; sender_id: string; body: string; created_at: string; pending?: boolean };

export function Chat({
  matchId,
  me,
  otherName,
  otherAvatar,
  initial,
}: {
  matchId: string;
  me: string;
  otherName: string;
  otherAvatar: string;
  initial: Msg[];
  backPath?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [live, setLive] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createClient());
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  // New server data (e.g. after a Trade Card action) replaces our list
  useEffect(() => setMessages(initial), [initial]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, otherTyping]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    let cancelled = false;

    async function connect() {
      // Load the sign-in first so the live feed connects as this user, not as a visitor.
      // Without this, the database's privacy rules hide every message from the feed.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);

      const channel = supabase
        .channel(`match-${matchId}`, { config: { broadcast: { self: false } } })
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` },
          (payload) => {
            const m = payload.new as Msg;
            if (m.sender_id !== me) {
              setOtherTyping(false);
              supabase.rpc("mark_match_read", { p_match: matchId }).then(() => window.dispatchEvent(new Event("nav-counts:refresh")));
            }
            setMessages((list) => {
              if (list.some((x) => x.id === m.id)) return list;
              // Replace our own optimistic copy if it's there
              const i = list.findIndex((x) => x.pending && x.sender_id === m.sender_id && x.body === m.body);
              if (i >= 0) {
                const copy = list.slice();
                copy[i] = m;
                return copy;
              }
              return [...list, m];
            });
          },
        )
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (payload?.user === me) return;
          setOtherTyping(true);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setOtherTyping(false), 3500);
        })
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
      channelRef.current = channel;
    }

    connect();
    // Keep the live feed signed in when the session refreshes
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [matchId, me]);

  // Fallback: if the live feed isn't connected, check for new messages every 10s
  useEffect(() => {
    if (live) return;
    const t = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(t);
  }, [live, router]);

  function onType(value: string) {
    setDraft(value);
    const now = Date.now();
    if (value && channelRef.current && now - lastTypingSent.current > 1500) {
      lastTypingSent.current = now;
      channelRef.current.send({ type: "broadcast", event: "typing", payload: { user: me } });
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError(null);
    const temp: Msg = { id: `temp-${Date.now()}`, sender_id: me, body, created_at: new Date().toISOString(), pending: true };
    setMessages((list) => [...list, temp]);
    const { data, error } = await supabaseRef.current
      .from("messages")
      .insert({ match_id: matchId, sender_id: me, body })
      .select("id, sender_id, body, created_at")
      .single();
    if (error) {
      setMessages((list) => list.filter((m) => m.id !== temp.id));
      setDraft(body);
      setError(error.message.includes("row-level security") ? "You can't send messages in this chat right now." : "Message didn't send. Try again.");
      return;
    }
    setMessages((list) => {
      const withoutTemp = list.filter((m) => m.id !== temp.id);
      return withoutTemp.some((m) => m.id === data.id) ? withoutTemp : [...withoutTemp, data as Msg];
    });
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <div className="max-h-[50dvh] space-y-2 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-center text-sm text-stone-500">
            You matched with {otherName}. Talk through what each of you needs, then send a Trade Card.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex items-end gap-2 ${m.sender_id === me ? "justify-end" : "justify-start"}`}>
            {m.sender_id !== me && <Avatar name={otherName} url={otherAvatar} size={26} />}
            <p
              className={`max-w-[80%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
                m.sender_id === me ? "bg-teal-700 text-white" : "bg-stone-100 text-stone-900"
              } ${m.pending ? "opacity-60" : ""}`}
            >
              {m.body}
            </p>
          </div>
        ))}
        {otherTyping && (
          <div className="flex items-end gap-2">
            <Avatar name={otherName} url={otherAvatar} size={26} />
            <div className="flex items-center gap-2 rounded-2xl bg-stone-100 px-3 py-2">
              <span className="flex gap-1" aria-hidden="true">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" />
              </span>
              <span className="text-xs text-stone-500">{otherName.split(" ")[0]} is typing…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {error && <p className="px-3 text-xs text-rose-700">{error}</p>}
      <form onSubmit={send} className="flex gap-2 border-t border-stone-200 p-3">
        <input
          value={draft}
          onChange={(e) => onType(e.target.value)}
          maxLength={4000}
          autoComplete="off"
          placeholder="Message"
          aria-label="Message"
          className={inputCls}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
