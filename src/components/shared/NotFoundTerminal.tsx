"use client";

import { usePathname } from "next/navigation";

// Kept short — it is a 404, not a comedy set.
const QUIPS = [
  "the flag is in another castle",
  "have you tried ../../?",
  "scanned all 65535 ports, still nothing",
  "this endpoint was not in scope",
  "no such file or directory, and no such directory either",
  "404 is just a 200 that got away",
  "checked the logs. the logs are also confused",
  "someone redacted this one",
];

export function NotFoundTerminal() {
  const pathname = usePathname();
  // Whatever they typed, rendered as text inside a <pre>, never as markup.
  const target = (pathname || "/").slice(0, 80);

  // Chosen from the path rather than at random: a random pick during render makes the
  // server and client disagree and React throws the tree out over a joke, and picking
  // after mount is a state update inside an effect. This way a different wrong URL
  // still gets a different line, and the same one is stable across a refresh.
  const hash = [...target].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const quip = QUIPS[hash % QUIPS.length];

  return (
    <div className="rounded-xl border bg-[#0b0b0d] p-4 font-mono text-[13px] leading-relaxed shadow-sm">
      <div className="mb-2.5 flex gap-1.5" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-zinc-300">
        <span className="text-[#00ffd1]">secsoc@portal</span>
        <span className="text-zinc-500">:~$</span> find . -path <span className="text-zinc-100">{target}</span>
        {"\n"}
        <span className="text-zinc-500">find: no matches</span>
        {"\n\n"}
        <span className="text-[#00ffd1]">secsoc@portal</span>
        <span className="text-zinc-500">:~$</span> hint
        {"\n"}
        <span className="text-zinc-400">{quip}</span>
        <span className="ml-0.5 inline-block w-[7px] animate-pulse bg-zinc-400 align-middle">&nbsp;</span>
      </pre>
    </div>
  );
}
