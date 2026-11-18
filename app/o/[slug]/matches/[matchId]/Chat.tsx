"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputCls } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { sendMessage } from "../../actions";

type Msg = { id: string; sender_id: string; body: string; created_at: string };

export function Chat({
  matchId,
  me,
  otherName,
  otherAvatar,
  initial,
  backPath,
}: {
  matchId: string;
  me: string;
  otherName: string;
  otherAvatar: string;
  initial: Msg[];
  backPath: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [initial.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`match-${matchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, router]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <div className="max-h-[50dvh] space-y-2 overflow-y-auto p-4">
        {initial.length === 0 && (
          <p className="text-center text-sm text-stone-500">
            You matched with {otherName}. Talk through what each of you needs, then send a Trade Card.
          </p>
        )}
        {initial.map((m) => (
          <div key={m.id} className={`flex items-end gap-2 ${m.sender_id === me ? "justify-end" : "justify-start"}`}>
            {m.sender_id !== me && <Avatar name={otherName} url={otherAvatar} size={26} />}
            <p
              className={`max-w-[80%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
                m.sender_id === me ? "bg-teal-700 text-white" : "bg-stone-100 text-stone-900"
              }`}
            >
              {m.body}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        ref={formRef}
        action={async (fd) => {
          await sendMessage(fd);
          formRef.current?.reset();
          router.refresh();
        }}
        className="flex gap-2 border-t border-stone-200 p-3"
      >
        <input type="hidden" name="match_id" value={matchId} />
        <input type="hidden" name="back" value={backPath} />
        <input name="body" required maxLength={4000} autoComplete="off" placeholder="Message" className={inputCls} />
        <SubmitButton pendingText="…">Send</SubmitButton>
      </form>
    </div>
  );
}
