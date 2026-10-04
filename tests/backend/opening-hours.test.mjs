import { test } from "node:test";
import assert from "node:assert/strict";
import { formatOpeningHours } from "../../shared/opening-hours.mjs";

test("simple weekdays, split periods and seasons keep their meaning in Polish", () => {
  assert.equal(
    formatOpeningHours("Mo-Fr 09:00-18:00; Sa-Su 10:00-16:00"),
    "pon.-pt. 09:00-18:00; sob.-niedz. 10:00-16:00",
  );
  assert.equal(
    formatOpeningHours("Apr-Oct: 06:00-22:00; Nov-Mar: 06:00-20:00"),
    "kwiecień-październik: 06:00-22:00; listopad-marzec: 06:00-20:00",
  );
  assert.equal(
    formatOpeningHours("Apr-Aug: Mo-Fr 09:00-19:00; Sep-Oct Sa,Su 10:00-19:00"),
    "kwiecień-sierpień: pon.-pt. 09:00-19:00; wrzesień-październik: sob.,niedz. 10:00-19:00",
  );
  assert.equal(
    formatOpeningHours("Mo,We,Fr 09:00-12:00,14:00-18:00; Su off"),
    "pon.,śr.,pt. 09:00-12:00,14:00-18:00; niedz. nieczynne",
  );
  assert.equal(formatOpeningHours("Fr 22:00-02:00"), "pt. 22:00-02:00");
  assert.equal(
    formatOpeningHours("Mo-Su 00:00-24:00"),
    "pon.-niedz. 00:00-24:00",
  );
});

test("exceptions, holidays, open-ended periods and malformed rules stay intact rather than becoming all-day access", () => {
  for (const raw of [
    "Mo-Su,PH 00:00+",
    "Mo-Su,PH 00:00-24:00",
    "24/7; PH off",
    "Mo-Fr 09:00-18:00; PH off",
    "Mo[1] 09:00-18:00",
    "sunrise-sunset",
    "Apr 01-Oct 31 09:00-18:00",
    'Mo-Fr 09:00-18:00 "by appointment"',
    "Mo-Fr 09:00+",
    "Mo 29:00-30:00",
    'Mo-Fr 09:00-18:00 || "call us"',
    "Mo-Fr 09:00-18:00;",
  ]) {
    assert.equal(formatOpeningHours(raw), `Zapis źródłowy: ${raw}`);
  }
});

test("missing and around-the-clock source records do not evaluate current opening", () => {
  assert.equal(formatOpeningHours(undefined), null);
  assert.equal(formatOpeningHours(null), null);
  assert.equal(formatOpeningHours("  "), null);
  assert.equal(
    formatOpeningHours("24/7"),
    "Całą dobę, codziennie (według źródła).",
  );
  assert.equal(formatOpeningHours("06:00-22:00"), "06:00-22:00");
});
