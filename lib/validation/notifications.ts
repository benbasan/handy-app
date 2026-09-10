import { z } from "zod";

/**
 * What a browser hands over when it subscribes to push.
 *
 * The shape comes from `PushSubscription.toJSON()`, so every field is
 * something the browser produced rather than something a person typed — but it
 * still arrives over the wire and is still validated here, for the reason
 * CLAUDE.md section 3 gives: every write path validates, even where the client
 * also does.
 *
 * The endpoint must be `https:`. A push endpoint is a URL this server will
 * later POST to, so accepting an arbitrary scheme would turn the dispatcher
 * into a request forwarder pointed wherever the caller liked.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .min(1, { error: "מנוי דחיפה לא תקין" })
    .max(2048)
    .refine((value) => value.startsWith("https://"), {
      error: "מנוי דחיפה לא תקין",
    }),
  p256dh: z.string().trim().min(1).max(512),
  auth: z.string().trim().min(1).max(512),
  userAgent: z
    .string()
    .trim()
    .max(400)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
