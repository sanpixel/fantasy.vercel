"use client";
// Copy a card or table as a PNG, or download it when the clipboard says no.
import { useState } from "react";

export function ShareButton({ target, name }: { target: string; name: string }) {
  const [label, setLabel] = useState("Copy image");
  async function go() {
    const el = document.getElementById(target);
    if (!el) return;
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(el, { backgroundColor: "#05070a", pixelRatio: 2, cacheBust: true });
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setLabel("Copied");
    } catch {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      setLabel("Saved");
    }
    setTimeout(() => setLabel("Copy image"), 1800);
  }
  return (
    <button className="chip" onClick={go} type="button">
      {label}
    </button>
  );
}
