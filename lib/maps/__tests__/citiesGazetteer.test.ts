import { describe, expect, it } from "vitest";
import { CITIES } from "@/lib/content/cities";
import { matchLocality } from "../gazetteer";
import { haversineKm } from "../geometry";

/**
 * lib/content/cities.ts promises, in its own header, that its coordinates
 * "match the gazetteer … Keep them in step: a page that counts pros around one
 * point and a job placed at another would quietly disagree about the same
 * city." Until now nothing checked it, and the gazetteer it referred to has
 * since been replaced wholesale.
 *
 * The two are not required to be identical — one is the centre a marketing
 * page counts pros around, the other is where an address with no better
 * information is pinned, and both are approximations of a city that is
 * kilometres across. They are required to be the same city, which is what a
 * few kilometres of agreement means here.
 */
const AGREEMENT_KM = 5;

describe("the SEO cities and the gazetteer agree", () => {
  it.each(CITIES.map((city) => [city.nameHe, city] as const))(
    "%s is a locality the gazetteer knows, at the same place",
    (_name, city) => {
      const locality = matchLocality(city.nameHe);
      expect(locality).not.toBeNull();

      const km = haversineKm(city, {
        lat: locality!.lat,
        lng: locality!.lng,
      });
      expect(km).toBeLessThan(AGREEMENT_KM);
    },
  );
});
