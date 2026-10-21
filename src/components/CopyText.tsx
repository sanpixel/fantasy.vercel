"use client";
import { useState } from "react";

export function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="row" style={{ gap: 8 }}>
      <code className="lime">{text}</code>
      <button
        type="button"
        className="chip"
        onClick={async () => {
          await navigator.clipboard.writeText(text).catch(() => {});
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
