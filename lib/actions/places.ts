"use server";

import { revalidatePath } from "next/cache";
import { fieldErrorsOf } from "@/lib/actions/formData";
import type { SavedPlaceState } from "@/lib/actions/state";
import { addressToStore, geocodeAddress } from "@/lib/maps/geocode";
import { toEwkt } from "@/lib/maps/geometry";
import { logExpectedRefusal, logServerError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import {
  removePlaceSchema,
  renamePlaceSchema,
  savePlaceSchema,
} from "@/lib/validation/places";

/**
 * כתובות שמורות — "בית", "עבודה", the address a customer posts most of their
 * calls from.
 *
 * The address goes through the very same `geocodeAddress` a job does, so a
 * saved place cannot be a way to store a point the job form would have
 * refused, and an address nobody can place is refused here too rather than
 * saved and found unusable later.
 *
 * `customer_id` is never written: `saved_places` gives no client role a grant
 * on it and defaults it to `auth.uid()`, which is what makes "your own list"
 * true in the database rather than in this file.
 */
export async function savePlace(
  _prevState: SavedPlaceState,
  formData: FormData,
): Promise<SavedPlaceState> {
  const user = await requireRole("customer");

  const parsed = savePlaceSchema.safeParse({
    label: formData.get("label"),
    addressText: formData.get("addressText"),
    lat: formData.get("lat") || null,
    lng: formData.get("lng") || null,
  });

  if (!parsed.success) {
    return {
      error: "יש למלא שם וכתובת.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const input = parsed.data;

  let point;
  try {
    point = await geocodeAddress(
      input.addressText,
      input.lat != null && input.lng != null
        ? { lat: input.lat, lng: input.lng }
        : null,
    );
  } catch (cause) {
    logServerError("places.savePlace.geocode", cause, { customerId: user.id });
    return { error: "תקלה זמנית באיתור הכתובת. נסו שוב בעוד רגע." };
  }

  if (!point) {
    logExpectedRefusal(
      "places.savePlace.unknownAddress",
      "no locality matched",
      {
        customerId: user.id,
      },
    );
    return {
      error: "לא זיהינו את היישוב בכתובת.",
      fieldErrors: {
        addressText: "הוסיפו עיר בסוף הכתובת, למשל: הרצל 5, נתניה",
      },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_places")
    .insert({
      label: input.label,
      address_text: addressToStore(input.addressText, point),
      location: toEwkt(point.lat, point.lng),
    })
    .select("id")
    .single();

  if (error || !data) {
    // 23505 is the (customer_id, address_text) unique index: this address is
    // already on their list, which is a slip and not a failure.
    if (error?.code === "23505") {
      logExpectedRefusal("places.savePlace.duplicate", error, {
        customerId: user.id,
      });
      return { fieldErrors: { addressText: "הכתובת הזו כבר שמורה אצלכם" } };
    }

    logServerError(
      "places.savePlace",
      error ?? new Error("insert returned no row"),
      {
        customerId: user.id,
      },
    );
    return { error: "לא הצלחנו לשמור את הכתובת. נסו שוב." };
  }

  revalidatePath("/account");
  revalidatePath("/new-request");
  return { savedPlaceId: data.id };
}

/** Renaming is the only edit: an address that moved is a different address. */
export async function renamePlace(
  _prevState: SavedPlaceState,
  formData: FormData,
): Promise<SavedPlaceState> {
  const user = await requireRole("customer");

  const parsed = renamePlaceSchema.safeParse({
    placeId: formData.get("placeId"),
    label: formData.get("label"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_places")
    .update({ label: parsed.data.label })
    .eq("id", parsed.data.placeId);

  if (error) {
    logServerError("places.renamePlace", error, {
      customerId: user.id,
      placeId: parsed.data.placeId,
    });
    return { error: "לא הצלחנו לשנות את השם. נסו שוב." };
  }

  revalidatePath("/account");
  revalidatePath("/new-request");
  return { savedPlaceId: parsed.data.placeId };
}

export async function removePlace(
  _prevState: SavedPlaceState,
  formData: FormData,
): Promise<SavedPlaceState> {
  const user = await requireRole("customer");

  const parsed = removePlaceSchema.safeParse({
    placeId: formData.get("placeId"),
  });

  if (!parsed.success) {
    return { error: "כתובת לא מזוהה." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_places")
    .delete()
    .eq("id", parsed.data.placeId);

  if (error) {
    logServerError("places.removePlace", error, {
      customerId: user.id,
      placeId: parsed.data.placeId,
    });
    return { error: "לא הצלחנו למחוק את הכתובת. נסו שוב." };
  }

  revalidatePath("/account");
  revalidatePath("/new-request");
  return { removed: true };
}
