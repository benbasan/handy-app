"use client";

import { useState } from "react";
import { BUTTON_COMPACT, BUTTON_QUIET } from "@/components/ui/primitives";

/** Copies the pro's personal link. Says so for two seconds, then goes quiet. */
export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard refused (an insecure origin, a browser policy). The link
          // is printed right above the button, so nothing is lost.
        }
      }}
      className={`${BUTTON_QUIET} ${BUTTON_COMPACT} w-full`}
    >
      {copied ? "✓ הקישור הועתק" : "העתקת הקישור"}
    </button>
  );
}
