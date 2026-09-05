/**
 * The controlled vocabularies a pilot profile is built from.
 *
 * These are lists, not free text, on purpose. "High pole" typed four different
 * ways cannot be matched against a load that needs a high pole, and a region
 * spelled "Tex" cannot be checked against a permit. Matching in Phase H depends
 * entirely on both sides choosing from the same list.
 */

export interface Region {
  code: string;
  name: string;
  country: "US" | "CA";
}

/**
 * Every US state plus DC, and every Canadian province and territory.
 *
 * The plan's default, and the right one: OS/OW escort work follows permits
 * across state lines, so a pilot's certifications are per region and the list
 * cannot be trimmed to a launch corridor without stranding anyone certified
 * elsewhere.
 */
export const REGIONS: Region[] = [
  { code: "AL", name: "Alabama", country: "US" },
  { code: "AK", name: "Alaska", country: "US" },
  { code: "AZ", name: "Arizona", country: "US" },
  { code: "AR", name: "Arkansas", country: "US" },
  { code: "CA", name: "California", country: "US" },
  { code: "CO", name: "Colorado", country: "US" },
  { code: "CT", name: "Connecticut", country: "US" },
  { code: "DE", name: "Delaware", country: "US" },
  { code: "DC", name: "District of Columbia", country: "US" },
  { code: "FL", name: "Florida", country: "US" },
  { code: "GA", name: "Georgia", country: "US" },
  { code: "HI", name: "Hawaii", country: "US" },
  { code: "ID", name: "Idaho", country: "US" },
  { code: "IL", name: "Illinois", country: "US" },
  { code: "IN", name: "Indiana", country: "US" },
  { code: "IA", name: "Iowa", country: "US" },
  { code: "KS", name: "Kansas", country: "US" },
  { code: "KY", name: "Kentucky", country: "US" },
  { code: "LA", name: "Louisiana", country: "US" },
  { code: "ME", name: "Maine", country: "US" },
  { code: "MD", name: "Maryland", country: "US" },
  { code: "MA", name: "Massachusetts", country: "US" },
  { code: "MI", name: "Michigan", country: "US" },
  { code: "MN", name: "Minnesota", country: "US" },
  { code: "MS", name: "Mississippi", country: "US" },
  { code: "MO", name: "Missouri", country: "US" },
  { code: "MT", name: "Montana", country: "US" },
  { code: "NE", name: "Nebraska", country: "US" },
  { code: "NV", name: "Nevada", country: "US" },
  { code: "NH", name: "New Hampshire", country: "US" },
  { code: "NJ", name: "New Jersey", country: "US" },
  { code: "NM", name: "New Mexico", country: "US" },
  { code: "NY", name: "New York", country: "US" },
  { code: "NC", name: "North Carolina", country: "US" },
  { code: "ND", name: "North Dakota", country: "US" },
  { code: "OH", name: "Ohio", country: "US" },
  { code: "OK", name: "Oklahoma", country: "US" },
  { code: "OR", name: "Oregon", country: "US" },
  { code: "PA", name: "Pennsylvania", country: "US" },
  { code: "RI", name: "Rhode Island", country: "US" },
  { code: "SC", name: "South Carolina", country: "US" },
  { code: "SD", name: "South Dakota", country: "US" },
  { code: "TN", name: "Tennessee", country: "US" },
  { code: "TX", name: "Texas", country: "US" },
  { code: "UT", name: "Utah", country: "US" },
  { code: "VT", name: "Vermont", country: "US" },
  { code: "VA", name: "Virginia", country: "US" },
  { code: "WA", name: "Washington", country: "US" },
  { code: "WV", name: "West Virginia", country: "US" },
  { code: "WI", name: "Wisconsin", country: "US" },
  { code: "WY", name: "Wyoming", country: "US" },
  { code: "AB", name: "Alberta", country: "CA" },
  { code: "BC", name: "British Columbia", country: "CA" },
  { code: "MB", name: "Manitoba", country: "CA" },
  { code: "NB", name: "New Brunswick", country: "CA" },
  { code: "NL", name: "Newfoundland and Labrador", country: "CA" },
  { code: "NS", name: "Nova Scotia", country: "CA" },
  { code: "NT", name: "Northwest Territories", country: "CA" },
  { code: "NU", name: "Nunavut", country: "CA" },
  { code: "ON", name: "Ontario", country: "CA" },
  { code: "PE", name: "Prince Edward Island", country: "CA" },
  { code: "QC", name: "Quebec", country: "CA" },
  { code: "SK", name: "Saskatchewan", country: "CA" },
  { code: "YT", name: "Yukon", country: "CA" },
];

const REGION_CODES = new Set(REGIONS.map((r) => r.code));
export const isRegionCode = (code: string) => REGION_CODES.has(code);

/**
 * Equipment, from the design spec's controlled catalogue (§2.16–2.17 Fix).
 * Deliberately not free text — a load that requires a high pole must be
 * matchable against pilots who have one.
 */
export const EQUIPMENT = [
  { id: "high-pole", label: "High pole" },
  { id: "amber-light-bar", label: "Amber light bar" },
  { id: "oversize-signs", label: "OVERSIZE LOAD signs" },
  { id: "flags", label: "Flags" },
  { id: "cb-radio", label: "CB radio" },
  { id: "two-way-radios", label: "Two-way radios" },
  { id: "stop-slow-paddles", label: "Stop/slow paddles" },
  { id: "fire-extinguisher", label: "Fire extinguisher" },
  { id: "safety-vest", label: "Safety vest" },
  { id: "reflective-cones", label: "Reflective cones" },
  { id: "warning-flashers", label: "Warning flashers" },
  { id: "first-aid-kit", label: "First-aid kit" },
] as const;

export type EquipmentId = (typeof EQUIPMENT)[number]["id"];

const EQUIPMENT_IDS = new Set(EQUIPMENT.map((e) => e.id as string));
export const isEquipmentId = (id: string) => EQUIPMENT_IDS.has(id);

/** The escort positions a pilot can work, and a load can require. */
export const SERVICES = [
  { id: "lead", label: "Lead" },
  { id: "chase", label: "Chase" },
  { id: "high-pole", label: "High pole" },
  { id: "steer", label: "Steer" },
  { id: "route-survey", label: "Route survey" },
] as const;

export type ServiceId = (typeof SERVICES)[number]["id"];

const SERVICE_IDS = new Set(SERVICES.map((s) => s.id as string));
export const isServiceId = (id: string) => SERVICE_IDS.has(id);

/**
 * The documents we ask a pilot for.
 *
 * `expiryRequired` drives the reminders and the automatic expiry: an insurance
 * certificate with no end date is not a certificate, it is a photograph.
 */
export const DOCUMENT_TYPES = [
  { id: "drivers-license", label: "Driver's licence", expiryRequired: true },
  { id: "insurance", label: "Commercial insurance (COI)", expiryRequired: true },
  { id: "medical-card", label: "Medical certificate", expiryRequired: true },
  { id: "vehicle-registration", label: "Vehicle registration", expiryRequired: true },
  { id: "certification", label: "Escort certification", expiryRequired: true },
  { id: "other", label: "Other supporting document", expiryRequired: false },
] as const;

export type DocumentTypeId = (typeof DOCUMENT_TYPES)[number]["id"];

const DOC_TYPE_IDS = new Set(DOCUMENT_TYPES.map((d) => d.id as string));
export const isDocumentTypeId = (id: string) => DOC_TYPE_IDS.has(id);

export function documentLabel(id: string): string {
  return DOCUMENT_TYPES.find((d) => d.id === id)?.label ?? "Document";
}

export function regionName(code: string): string {
  return REGIONS.find((r) => r.code === code)?.name ?? code;
}
