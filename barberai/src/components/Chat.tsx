"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Channel, ConversationState, Message } from "@/lib/assistant";
import { createInitialState, respond } from "@/lib/assistant";
import { detectLanguage, t } from "@/lib/i18n";
import { loadAppointments, toLocalDateLabel } from "@/lib/scheduling";

export default function Chat() {
  const [channel, setChannel] = useState<Channel>("website");
  const [state, setState] = useState<ConversationState>(createInitialState());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Kickoff greeting
  useEffect(() => {
    const first = respond("", state, channel);
    setMessages((m) => m.concat(first.messages));
    setState(first.next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Set up reminder timers from storage
  useEffect(() => {
    const appts = loadAppointments();
    appts.forEach((a) => maybeScheduleReminder(a.datetimeIso, a.reminder));
  }, []);

  const lang = useMemo(() => detectLanguage(latestUserText(messages) ?? ""), [messages]);

  function onSend() {
    const text = input.trim();
    if (!text) return;
    const now = new Date();
    addUserMsg(text);
    const r = respond(text, state, channel, now);
    setMessages((m) => m.concat(r.messages));
    setState(r.next);
    if (r.reminderTimerMs && r.reminderTimerMs > 0) {
      scheduleTimer(r.reminderTimerMs);
    }
    setInput("");
  }

  function addUserMsg(text: string) {
    setMessages((m) => m.concat([{ id: id(), role: "user", text, ts: Date.now() }]));
  }

  function scheduleTimer(ms: number) {
    window.setTimeout(() => {
      const l = detectLanguage(latestUserText(messages) ?? "");
      const when = nextAppointmentLabel();
      const txt = l === "ar" ? `????? ?????? ????? ${when}` : `Reminder: your appointment today at ${when}`;
      // Notification API
      if ("Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification(txt);
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission().then((perm) => {
            if (perm === "granted") new Notification(txt);
          });
        }
      }
      setMessages((m) => m.concat([{ id: id(), role: "assistant", text: txt, ts: Date.now() }]));
    }, ms);
  }

  function maybeScheduleReminder(datetimeIso: string, enabled: boolean) {
    if (!enabled) return;
    const target = new Date(datetimeIso);
    const threeHours = 3 * 60 * 60 * 1000;
    const fireAt = target.getTime() - threeHours;
    const ms = fireAt - Date.now();
    if (ms > 0) scheduleTimer(ms);
  }

  function nextAppointmentLabel(): string {
    const appts = loadAppointments().sort((a, b) => new Date(a.datetimeIso).getTime() - new Date(b.datetimeIso).getTime());
    const now = new Date();
    const next = appts.find((a) => new Date(a.datetimeIso) > now);
    if (!next) return "";
    const d = new Date(next.datetimeIso);
    return `${toLocalDateLabel(d)} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }

  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-rose-500 to-amber-400 text-white grid place-items-center text-xl">??</div>
          <div className="flex flex-col">
            <span className="font-semibold">BarberAI</span>
            <span className="text-xs text-zinc-500">{lang === "ar" ? "????? ?????? ?????" : "Your friendly barber assistant"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-zinc-500">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="website">Website</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </header>

      <div ref={listRef} className="mb-3 h-[55vh] w-full overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.text} />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder={lang === "ar" ? "???? ???????" : "Type your message?"}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:ring-2 focus:ring-rose-400 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={onSend}
          className="rounded-lg bg-rose-500 px-4 py-2 font-medium text-white hover:bg-rose-600"
        >
          {lang === "ar" ? "?????" : "Send"}
        </button>
      </div>

      <footer className="mt-3 text-xs text-zinc-500">
        {lang === "ar"
          ? "????? ??? ?????? ????? ????? ??? ????? ??????? ? ????? ???? ?????? ????? ??? ??? ?????."
          : "We?ll remind you 3 hours before if enabled ? showing only available slots."}
      </footer>
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const isUser = role === "user";
  return (
    <div className={`mb-2 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm shadow-sm ${
          isUser
            ? "bg-rose-500 text-white rounded-br-sm"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 rounded-bl-sm"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function latestUserText(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].text;
  }
  return null;
}

function id(): string {
  return Math.random().toString(36).slice(2);
}
