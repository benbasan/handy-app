import type { ComponentType, SVGProps } from "react";

/**
 * The icon set — one file, inline SVG, no dependency.
 *
 * Until Phase 13.5 every pictogram in this app was an emoji, and the comment in
 * lib/categories.ts defended that with three reasons: the design uses those
 * glyphs, they need no bundle, and they render without a font fallback dance.
 * The first is true and the other two were the wrong things to optimise for.
 *
 * What an emoji cannot do:
 *
 *  * **Inherit colour.** `text-brand` on a span containing 🚿 does nothing. So
 *    a selected category tile could change its border, its ground and its text
 *    and the one element in the middle of it stayed exactly the same — which is
 *    the opposite of what a selected state is for.
 *  * **Be the same picture twice.** 🔧 is a spanner on Apple, a different
 *    spanner on Android and a socket wrench on Windows; ☂️ and ❄️ carry a
 *    presentation selector that some platforms render as flat black line art
 *    and others as a full-colour sticker. The category strip on the landing
 *    page is the first thing a visitor sees, and it was a different strip per
 *    device.
 *  * **Hold a line weight.** Beside Heebo at 14px, colour emoji read as
 *    stickers — on the public pages whose whole job is to be trusted.
 *
 * The rules here, so a later addition matches: 24×24 box, no fill, stroke is
 * `currentColor` at 1.75, round caps and joins, and size comes from the caller
 * through `className` (`size-5`). `aria-hidden` by default because an icon in
 * this app always sits beside its own label — pass `aria-hidden={false}` and a
 * `<title>` only where it does not.
 */

export type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- categories */

/** אינסטלציה — a shower head over falling water. */
export const ShowerIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 2.5v4" />
    <path d="M4.5 6.5h15l-2.5 4.5H7z" />
    <path d="M8.5 14.5v3M12 14v4M15.5 14.5v3" />
  </Icon>
);

/** חשמל — a bolt. */
export const BoltIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13.5 2 4 13.5h6.5L10 22l9.5-11.5H13z" />
  </Icon>
);

/** מיזוג — a snowflake. */
export const SnowflakeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 2.5v19M4 7.25l16 9.5M20 7.25l-16 9.5" />
    <path d="M12 6 9.75 3.75M12 6l2.25-2.25M12 18l-2.25 2.25M12 18l2.25 2.25" />
  </Icon>
);

/** נגרות — a hammer. */
export const HammerIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9.5 3.5h7A1.5 1.5 0 0 1 18 5v3a1.5 1.5 0 0 1-1.5 1.5h-7z" />
    <path d="M9.5 3.5 6 6.5l3.5 3" />
    <path d="M13 9.5v11" />
  </Icon>
);

/** צביעה — a brush. */
export const BrushIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="3.5" width="12" height="5" rx="1.5" />
    <path d="M15 6h3.5A1.5 1.5 0 0 1 20 7.5v2A1.5 1.5 0 0 1 18.5 11h-6A1.5 1.5 0 0 0 11 12.5V14" />
    <rect x="8.5" y="14" width="5" height="6.5" rx="1.2" />
  </Icon>
);

/** מנעולן — a key. */
export const KeyIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="7.5" cy="16.5" r="4" />
    <path d="m10.5 13.5 9-9M17 7l2.5 2.5M14.5 9.5 17 12" />
  </Icon>
);

/** גינון — a leaf. */
export const LeafIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20c0-8 5-14 16-15 0 11-5 15-11 15-2.5 0-5-1-5-1z" />
    <path d="M4.5 20c3-6 7-9 12-11" />
  </Icon>
);

/** ניקיון — a spray bottle. */
export const SprayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 8h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" />
    <path d="M8 8V4.5A1.5 1.5 0 0 1 9.5 3h2" />
    <path d="M15 5.5h3M15 8.5h3M18.5 3.5v1M18.5 9.5v1M21 6.5h1" />
  </Icon>
);

/** הרכבת רהיטים — a spanner. */
export const WrenchIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15.5 3a5.5 5.5 0 0 0-5 7.7L3.6 17.6a2 2 0 0 0 2.8 2.8l6.9-6.9A5.5 5.5 0 0 0 20.4 6l-2.8 2.8-2.4-2.4L18 3.6A5.5 5.5 0 0 0 15.5 3z" />
  </Icon>
);

/** איטום — a droplet under a roof. */
export const WaterproofIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 10 12 3l9 7" />
    <path d="M12 21c2.2 0 4-1.7 4-3.9 0-2.3-4-6.1-4-6.1s-4 3.8-4 6.1c0 2.2 1.8 3.9 4 3.9z" />
  </Icon>
);

/** The fallback for a category with no icon of its own — crossed tools. */
export const ToolsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 9h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 9V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V9" />
    <path d="M3 13.5h18M12 12v3" />
  </Icon>
);

/* ---------------------------------------------------------------- functional */

/** מאומת — the tick beside every verification badge. */
export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
);

/** דירוג. `filled` for a score that exists; outline for one that does not. */
export const StarIcon = ({
  filled = false,
  ...props
}: IconProps & { filled?: boolean }) => (
  <Icon fill={filled ? "currentColor" : "none"} {...props}>
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z" />
  </Icon>
);

/** מיקום. */
export const MapPinIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Icon>
);

/** מפה — the placeholder panel where a Maps key would put a real map. */
export const MapIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" />
    <path d="M9 4v13M15 6.5v13" />
  </Icon>
);

/** תוקף, זמן הגעה, ספירה לאחור. */
export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 2" />
  </Icon>
);

/** התראות. */
export const BellIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 4.5-1.5 6-2 6.5h16c-.5-.5-2-2-2-6.5z" />
    <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
  </Icon>
);

/** הודעות, צ׳אט. */
export const MessageIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21 12.5a7.5 7.5 0 0 1-7.5 7.5c-1.3 0-2.6-.3-3.7-.9L4 21l1.9-5.3A7.5 7.5 0 1 1 21 12.5z" />
  </Icon>
);

/** צירוף מדיה, תמונת התקלה. */
export const CameraIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Icon>
);

/** משהו דחוף או שגוי. */
export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5 21.5 20h-19z" />
    <path d="M12 9.5v4.5M12 17h.01" />
  </Icon>
);

/** ארנק, הכנסות. */
export const WalletIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a1 1 0 0 1 1 1v1.5" />
    <path d="M3 7.5v9A2.5 2.5 0 0 0 5.5 19h13a2.5 2.5 0 0 0 2.5-2.5v-6A2.5 2.5 0 0 0 18.5 8h-13A2.5 2.5 0 0 1 3 7.5z" />
    <path d="M17 13h.01" />
  </Icon>
);

/** קריאות, רשימת עבודות. */
export const ClipboardIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15" />
    <rect x="9" y="2.5" width="6" height="4" rx="1.2" />
    <path d="M9.5 11h5M9.5 15h3" />
  </Icon>
);

/** האזור האישי, פרופיל. */
export const UserIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="3.75" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Icon>
);

/** "עוד" — the sheet the mobile tab bar opens. */
export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

/** סגירה. */
export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);

/**
 * "המשך" — pointing at the inline end.
 *
 * Drawn pointing left, which is forward in an RTL document. This app renders
 * `dir="rtl"` at the root and nowhere else, so there is no LTR case to mirror
 * for; if one ever appears this is the icon that has to learn `rtl:rotate-180`.
 */
export const ChevronEndIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m14 6-6 6 6 6" />
  </Icon>
);

/** ביטול פעולה — the undo on a toast. */
export const UndoIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9h10a5.5 5.5 0 0 1 0 11h-3" />
    <path d="M7.5 5.5 4 9l3.5 3.5" />
  </Icon>
);

export type IconComponent = ComponentType<IconProps>;
