// Freshwater water-quality rules. Shared by the browser (public/app.js) and
// the Netlify function, so the verdict is always computed the same way.
//
// Every reading is in ppm (mg/L) except pH. A reading of null means
// "not tested / couldn't read", and is skipped.

export const PARAMETERS = [
  { key: "ammonia", label: "Ammonia (NH3/NH4)", unit: "ppm" },
  { key: "nitrite", label: "Nitrite (NO2)", unit: "ppm" },
  { key: "nitrate", label: "Nitrate (NO3)", unit: "ppm" },
  { key: "ph", label: "pH", unit: "" },
  { key: "kh", label: "Carbonate hardness (KH)", unit: "ppm" },
  { key: "gh", label: "General hardness (GH)", unit: "ppm" },
  { key: "chlorine", label: "Chlorine (Cl2)", unit: "ppm" },
];

// Higher number = worse. The overall verdict is the worst status found.
const SEVERITY = { ok: 0, watch: 1, change_soon: 2, change_now: 3 };

function check(key, value) {
  switch (key) {
    case "ammonia":
      if (value <= 0) return { status: "ok", message: "No ammonia detected." };
      if (value < 0.5)
        return {
          status: "change_soon",
          message: "Ammonia is present. Even small amounts burn fish gills.",
          action: "Do a 25-30% water change within 24 hours and cut feeding in half until ammonia reads 0.",
        };
      return {
        status: "change_now",
        message: "Ammonia is at a toxic level.",
        action: "Do a 50% water change today, add a dechlorinator that also detoxifies ammonia (e.g. Seachem Prime), and retest tomorrow.",
      };

    case "nitrite":
      if (value <= 0) return { status: "ok", message: "No nitrite detected." };
      if (value < 0.5)
        return {
          status: "change_soon",
          message: "Nitrite is present, which usually means the filter bacteria are not keeping up.",
          action: "Do a 25-30% water change within 24 hours. Don't clean or replace filter media this week.",
        };
      return {
        status: "change_now",
        message: "Nitrite is at a toxic level.",
        action: "Do a 50% water change today and retest daily. Don't clean or replace filter media.",
      };

    case "nitrate":
      if (value <= 20) return { status: "ok", message: "Nitrate is in the safe range (20 ppm or less)." };
      if (value <= 40)
        return {
          status: "change_soon",
          message: "Nitrate is building up.",
          action: "Do a 25% water change in the next day or two and vacuum the gravel.",
        };
      if (value < 80)
        return {
          status: "change_now",
          message: "Nitrate is high and stresses fish over time.",
          action: "Do a 40-50% water change today and vacuum the gravel.",
        };
      return {
        status: "change_now",
        message: "Nitrate is very high.",
        action: "Do a 50% water change today, then another 25-30% in 2-3 days. Lowering it gradually avoids shocking the fish.",
      };

    case "ph":
      if (value >= 6.5 && value <= 8.0)
        return { status: "ok", message: "pH is in the normal range for most freshwater fish (6.5-8.0)." };
      if (value >= 6.0 && value <= 8.5)
        return {
          status: "watch",
          message: value < 6.5 ? "pH is on the low side." : "pH is on the high side.",
          action: "Check what your fish species prefer. Avoid sudden pH swings; change it by no more than 0.2-0.3 per day.",
        };
      return {
        status: "change_soon",
        message: value < 6.0 ? "pH is very low (acidic)." : "pH is very high (alkaline).",
        action:
          "Test your tap water's pH. If it's closer to normal, do a 25% water change and repeat over a few days. Don't use pH-adjusting chemicals for fast fixes.",
      };

    case "kh":
      if (value < 40)
        return {
          status: "watch",
          message: "KH is low, so pH can drop suddenly (a \"pH crash\").",
          action: "Regular water changes restore KH. If it stays low, add crushed coral to the filter or a KH buffer.",
        };
      return { status: "ok", message: "KH is high enough to keep pH stable." };

    case "gh":
      if (value < 50)
        return { status: "watch", message: "Water is very soft. Fine for soft-water fish, but check your species." };
      if (value > 300)
        return { status: "watch", message: "Water is very hard. Fine for hard-water fish, but check your species." };
      return { status: "ok", message: "General hardness is in a typical range." };

    case "chlorine":
      if (value <= 0) return { status: "ok", message: "No chlorine detected." };
      return {
        status: "change_now",
        message: "Chlorine is present and toxic to fish and filter bacteria.",
        action: "Add a dechlorinator to the tank right away, and always treat new tap water before adding it.",
      };

    default:
      return null;
  }
}

const VERDICTS = {
  ok: {
    title: "Your water looks good",
    summary: "No water change is needed right now. Keep up your normal routine of a 10-25% change each week.",
  },
  watch: {
    title: "No water change needed, but keep an eye on it",
    summary: "Nothing is dangerous, but one or more values is outside the ideal range. See the notes below.",
  },
  change_soon: {
    title: "Change the water soon",
    summary: "Do a partial water change in the next day or two. The steps are below.",
  },
  change_now: {
    title: "Change the water today",
    summary: "One or more values is at a level that can harm your fish. Follow the steps below today.",
  },
};

export function assess(readings) {
  const results = [];
  for (const { key, label, unit } of PARAMETERS) {
    const raw = readings?.[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const result = check(key, value);
    if (result) results.push({ key, label, unit, value, ...result });
  }

  if (results.length === 0) {
    return {
      verdict: "unknown",
      title: "Not enough readings",
      summary: "Enter at least one test value, or upload a clearer photo.",
      results,
      actions: [],
    };
  }

  const worst = results.reduce((a, b) => (SEVERITY[b.status] > SEVERITY[a.status] ? b : a)).status;
  const actions = results.filter((r) => r.action).sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status]).map((r) => r.action);
  if (SEVERITY[worst] >= SEVERITY.change_soon) {
    actions.push("Use a dechlorinator on the new water and match its temperature to the tank.");
    actions.push("Retest in 24-48 hours to make sure the numbers are coming down.");
  }

  return { verdict: worst, ...VERDICTS[worst], results, actions: [...new Set(actions)] };
}
