const DAYS = {
  Mo: "pon.",
  Tu: "wt.",
  We: "śr.",
  Th: "czw.",
  Fr: "pt.",
  Sa: "sob.",
  Su: "niedz.",
};
const MONTHS = {
  Jan: "styczeń",
  Feb: "luty",
  Mar: "marzec",
  Apr: "kwiecień",
  May: "maj",
  Jun: "czerwiec",
  Jul: "lipiec",
  Aug: "sierpień",
  Sep: "wrzesień",
  Oct: "październik",
  Nov: "listopad",
  Dec: "grudzień",
};
const selector = (values) => {
  const token = `(?:${Object.keys(values).join("|")})`;
  return `${token}(?:-${token})?(?:\\s*,\\s*${token}(?:-${token})?)*`;
};
const clock = "(?:[01]\\d|2[0-3]):[0-5]\\d";
const period = `${clock}\\s*-\\s*(?:${clock}|24:00)`;
const rulePattern = new RegExp(
  `^(?:(${selector(MONTHS)})(?:\\s*:\\s*|\\s+))?(?:(${selector(DAYS)})\\s+)?(${period}(?:\\s*,\\s*${period})*|off|closed)$`,
);
const translate = (text, names) =>
  text.replace(/[A-Za-z]+/g, (token) => names[token]);

/** Format a conservative subset; never calculate whether a place is open now. */
export function formatOpeningHours(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (raw === "24/7") return "Całą dobę, codziennie (według źródła).";
  const rules = raw.split(";").map((rule) => rule.trim());
  const parsed = rules.map((rule) => rulePattern.exec(rule));
  // Never partially translate exceptions, holidays, dates, comments or an
  // open-ended interval. Their meaning must remain available in the source.
  if (parsed.some((rule) => !rule)) return `Zapis źródłowy: ${raw}`;
  return parsed
    .map(([, months, days, times]) => {
      const prefix = [
        months ? `${translate(months, MONTHS)}:` : "",
        days ? translate(days, DAYS) : "",
      ]
        .filter(Boolean)
        .join(" ");
      const hours = times === "off" || times === "closed" ? "nieczynne" : times;
      return `${prefix}${prefix ? " " : ""}${hours}`;
    })
    .join("; ");
}
