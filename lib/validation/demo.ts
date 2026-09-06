import { z } from "zod";
import { DEMO_USER_KEYS } from "@/lib/demo";

/**
 * The only thing the demo sign-in action accepts.
 *
 * It is one field and it is the whole security model, so it is worth saying
 * why it is a key and not a phone number. A server action is callable by
 * anyone who has its id, whether or not the button that calls it was ever
 * rendered — so whatever this schema admits is what a stranger can ask for.
 *
 * A `phone` field, however carefully checked against a list, would be a rule
 * that can be got wrong, and the moment Twilio is configured it would also be
 * a public endpoint that sends an SMS to any number handed to it. A key out of
 * four resolves to a phone *inside* the server, from `DEMO_USERS`, so there is
 * no path from request data to a phone string at all.
 *
 * In its own file rather than in validation/auth.ts because that module is
 * what `lib/demo.ts` reads `normalizeIsraeliMobile` from, and importing the
 * keys back into it would close a cycle.
 */
export const demoLoginSchema = z.object({
  user: z.enum(DEMO_USER_KEYS, { error: "משתמש הדמו הזה אינו מוכר." }),
});
