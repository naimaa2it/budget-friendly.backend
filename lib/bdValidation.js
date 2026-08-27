// Bangladesh phone-number and address validation for the support chatbot.
//
// The chatbot collects the customer's phone, city (district), zone (upazila)
// and full address before confirming an order. This module keeps that
// validation in one place so both the AI tool layer and the order helper agree
// on what "valid" means.

import {
  districts_en,
  upazilas_en,
} from "bangladesh-location-data";

// ── Phone ──────────────────────────────────────────────────────────────────

// Bangladeshi mobile numbers: 11 digits starting with 01, third digit 3-9
// (operators 013-019). Accepts an optional +88 / 88 country prefix and any
// spaces/dashes the customer might type.
export function normalizeBdPhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d]/g, "");
  if (d.startsWith("88")) d = d.slice(2); // strip country code
  return d;
}

export function isValidBdPhone(raw) {
  const d = normalizeBdPhone(raw);
  return !!d && /^01[3-9]\d{8}$/.test(d);
}

// ── Address (district + upazila) ────────────────────────────────────────────

// Flatten districts into a single [{ value, title }] list, and build a lookup
// of district value -> upazila titles. Computed once at module load.
const DISTRICTS = [];
for (const group of Object.values(districts_en)) {
  if (Array.isArray(group)) DISTRICTS.push(...group);
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// The location dataset only has English district titles, so map the common
// Bangla-script names to their English form. Lets customers type "ঢাকা" etc.
const BN_DISTRICT_ALIASES = {
  "ঢাকা": "Dhaka",
  "চট্টগ্রাম": "Chattogram",
  "চিটাগাং": "Chattogram",
  "খুলনা": "Khulna",
  "রাজশাহী": "Rajshahi",
  "সিলেট": "Sylhet",
  "বরিশাল": "Barisal",
  "রংপুর": "Rangpur",
  "ময়মনসিংহ": "Mymensingh",
  "কুমিল্লা": "Cumilla",
  "গাজীপুর": "Gazipur",
  "নারায়ণগঞ্জ": "Narayanganj",
  "বগুড়া": "Bogura",
  "যশোর": "Jashore",
  "কক্সবাজার": "Cox's Bazar",
  "টাঙ্গাইল": "Tangail",
  "দিনাজপুর": "Dinajpur",
  "পাবনা": "Pabna",
  "নোয়াখালী": "Noakhali",
  "ফেনী": "Feni",
  "ব্রাহ্মণবাড়িয়া": "Brahmanbaria",
  "নরসিংদী": "Narsingdi",
  "সিরাজগঞ্জ": "Sirajganj",
  "মানিকগঞ্জ": "Manikganj",
  "কিশোরগঞ্জ": "Kishoreganj",
  "ফরিদপুর": "Faridpur",
  "জামালপুর": "Jamalpur",
  "পটুয়াখালী": "Patuakhali",
  "সাতক্ষীরা": "Satkhira",
  "মৌলভীবাজার": "Moulvibazar",
  "হবিগঞ্জ": "Habiganj",
  "চাঁদপুর": "Chandpur",
  "লক্ষ্মীপুর": "Lakshmipur",
};

// Match a free-text city name to a real district. Returns the canonical
// district object ({ value, title }) or null.
export function matchDistrict(cityName) {
  let raw = String(cityName || "").trim();
  if (BN_DISTRICT_ALIASES[raw]) raw = BN_DISTRICT_ALIASES[raw];
  const n = norm(raw);
  if (!n) return null;
  // exact match first, then "starts with" as a light fuzzy fallback
  return (
    DISTRICTS.find((d) => norm(d.title) === n) ||
    DISTRICTS.find((d) => norm(d.title).startsWith(n) || n.startsWith(norm(d.title))) ||
    null
  );
}

// Given a matched district and a free-text zone name, find the upazila.
// Returns the canonical upazila title or null.
export function matchUpazila(districtValue, zoneName) {
  const list = upazilas_en[districtValue] || [];
  const n = norm(zoneName);
  if (!n) return null;
  const hit =
    list.find((u) => norm(u.title) === n) ||
    list.find((u) => norm(u.title).startsWith(n) || n.startsWith(norm(u.title)));
  return hit ? hit.title : null;
}

// Validate a full delivery address collected by the chatbot. `zone`/`area` are
// optional (many customers only know the district); a valid district is the
// minimum bar so the order can be routed.
// `requireAddress` — when false, the full street address is optional (staff
// placing an order on the customer's behalf may only have the district).
export function validateBdAddress({ city, zone, area, address, requireAddress = true } = {}) {
  const errors = [];
  const district = matchDistrict(city);
  if (!district) {
    errors.push(
      `"${city || ""}" — এই নামের কোনো জেলা আমাদের বাংলাদেশ লোকেশন লিস্টে নেই। সঠিক জেলার নাম লিখুন (যেমন: ঢাকা/Dhaka, চট্টগ্রাম/Chattogram, খুলনা/Khulna)।`,
    );
  }

  // Zone (thana/upazila) is best-effort: metropolitan thanas aren't always in
  // the dataset, so a miss must not block the order — we keep what the customer
  // typed. Only the district is a hard requirement (it routes delivery).
  let matchedZone = null;
  if (district && zone) {
    matchedZone = matchUpazila(district.value, zone);
  }

  if (requireAddress && (!address || String(address).trim().length < 6)) {
    errors.push(
      "সম্পূর্ণ ঠিকানাটা একটু বিস্তারিত দিন (বাসা/রোড/গ্রাম, এলাকা)।",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: district
      ? {
          city: district.title,
          zone: matchedZone || (zone || ""),
          area: area || "",
          address: address || "",
        }
      : null,
  };
}

// A short list of valid district names, for prompting / suggestions.
export function districtNames() {
  return DISTRICTS.map((d) => d.title);
}
