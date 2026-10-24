// Pure draw logic: no DOM, so the same module runs in the browser and under `node --test`.
// Nothing personal lives in this repository: names and colours arrive from the organizer
// page and travel inside each person's link.

const SEPARATORS = /\s*(?:\+|,|;|&|\sir\s)\s*/i;

function cleanLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/[.!]+$/, "").trim())
    .filter((line) => line && !line.endsWith(":") && !/^\(.*\)$/.test(line));
}

const tidy = (name) => name.replace(/\s+/g, " ").trim();
const key = (name) => name.toLocaleLowerCase("lt");

/** One household per line; people in a line cannot draw each other. */
export function parseGroups(text) {
  const groups = [];
  const seen = new Map();
  const errors = [];
  for (const line of cleanLines(text)) {
    const group = line.split(SEPARATORS).map(tidy).filter(Boolean);
    const unique = [];
    for (const name of group) {
      if (seen.has(key(name))) {
        errors.push(`Vardas „${seen.get(key(name))}“ įrašytas daugiau nei kartą.`);
        continue;
      }
      seen.set(key(name), name);
      unique.push(name);
    }
    if (unique.length) groups.push(unique);
  }
  return { people: groups.flat(), groups, errors };
}

export function parseColors(text) {
  const seen = new Set();
  return cleanLines(text)
    .flatMap((line) => line.split(/\s*[,;]\s*/))
    .map(tidy)
    .filter((c) => c && !seen.has(key(c)) && seen.add(key(c)));
}

/** A valid draw exists exactly when no household holds more than half of everyone. */
export function checkFeasible(groups) {
  const total = groups.reduce((n, g) => n + g.length, 0);
  if (total < 2) return { ok: false, reason: "Reikia bent dviejų žmonių." };
  const largest = Math.max(...groups.map((g) => g.length));
  if (largest * 2 > total) {
    return {
      ok: false,
      reason: "Viena šeima per didelė: jos nariai sudaro daugiau nei pusę visų dalyvių, todėl traukimas neįmanomas.",
    };
  }
  return { ok: true };
}

function randomInt(max) {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % max;
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Returns { giver: receiver } where nobody draws themselves or their own household. */
export function drawPairs(groups) {
  const feasible = checkFeasible(groups);
  if (!feasible.ok) throw new Error(feasible.reason);
  const household = new Map(groups.flatMap((g, i) => g.map((name) => [name, i])));
  const givers = shuffle(groups.flat());
  const taken = new Set();
  const pairs = {};

  const assign = (index) => {
    if (index === givers.length) return true;
    const giver = givers[index];
    for (const receiver of shuffle(givers)) {
      if (taken.has(receiver) || household.get(receiver) === household.get(giver)) continue;
      taken.add(receiver);
      pairs[giver] = receiver;
      if (assign(index + 1)) return true;
      taken.delete(receiver);
    }
    return false;
  };

  if (!assign(0)) throw new Error("Nepavyko sudaryti porų.");
  return pairs;
}

function newId() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

/** Pairs plus colours. Colours repeat only when there are fewer colours than people. */
export function createDraw(groups, colors) {
  const pairs = drawPairs(groups);
  const palette = shuffle(colors);
  const id = newId();
  const tickets = groups.flat().map((giver, i) => ({
    d: id,
    g: giver,
    r: pairs[giver],
    c: palette.length ? palette[i % palette.length] : "",
  }));
  return { id, createdAt: new Date().toISOString(), tickets };
}

// Link encoding. This is obfuscation, not encryption: it keeps the result out of sight in
// the address bar and a message preview, and the checksum catches a mistyped link.

const SALT = new TextEncoder().encode("kaledu-traukimas");

function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

const mask = (bytes) => bytes.map((b, i) => b ^ SALT[i % SALT.length] ^ ((i * 31) & 0xff));

export function encodeTicket({ d, g, r, c }) {
  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, d, g, r, c }));
  const sum = fnv1a(plain);
  const out = new Uint8Array(plain.length + 4);
  out.set(mask(plain));
  out.set([sum >>> 24, (sum >>> 16) & 0xff, (sum >>> 8) & 0xff, sum & 0xff], plain.length);
  return toBase64Url(out);
}

export function decodeTicket(text) {
  try {
    if (!text || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
    const bytes = fromBase64Url(text);
    if (bytes.length < 8) return null;
    const plain = mask(bytes.slice(0, -4));
    const tail = bytes.slice(-4);
    const sum = ((tail[0] << 24) | (tail[1] << 16) | (tail[2] << 8) | tail[3]) >>> 0;
    if (fnv1a(plain) !== sum) return null;
    const data = JSON.parse(new TextDecoder().decode(plain));
    if (data.v !== 1 || typeof data.g !== "string" || typeof data.r !== "string") return null;
    return { d: String(data.d), g: data.g, r: data.r, c: String(data.c ?? "") };
  } catch {
    return null;
  }
}

// Lithuanian first-name forms for "Labas, Antanai!" and "dovaną ruoši Dariui".
// Rule-based for the common endings; anything else stays as written.

const VOCATIVE = [["ius", "iau"], ["us", "au"], ["as", "ai"], ["ys", "y"], ["is", "i"], ["ė", "e"]];
const DATIVE = [["tis", "čiui"], ["dis", "džiui"], ["ius", "iui"], ["us", "ui"], ["as", "ui"], ["ys", "iui"], ["is", "iui"], ["ė", "ei"], ["a", "ai"]];

function inflect(name, rules) {
  return name
    .split(" ")
    .map((word) => {
      if (word.length < 3 || /[^\p{L}-]/u.test(word)) return word;
      const lower = word.toLocaleLowerCase("lt");
      const rule = rules.find(([from]) => lower.endsWith(from));
      return rule ? word.slice(0, -rule[0].length) + rule[1] : word;
    })
    .join(" ");
}

export const vocative = (name) => inflect(name, VOCATIVE);
export const dative = (name) => inflect(name, DATIVE);

// Swatches for common Lithuanian colour names. Metallics get a gradient.
const SWATCHES = {
  balta: "#f6f6f2",
  juoda: "#1d1d1f",
  pilka: "#8a8f94",
  žydra: "#7cc4e6",
  raudona: "#c62a2f",
  bordo: "#7a1f2b",
  geltona: "#f3c94b",
  žalia: "#2f8a4c",
  salotinė: "#9bcf53",
  mėtinė: "#9fdcc4",
  mėlyna: "#2551a3",
  turkio: "#2bb3b1",
  ruda: "#7a4a2b",
  smėlio: "#d8c3a0",
  kreminė: "#f2e6c9",
  oranžinė: "#ee7b2c",
  rožinė: "#f19bbb",
  violetinė: "#6c3fa0",
  alyvinė: "#b49ad8",
  auksinė: "linear-gradient(135deg, #f7e08a 0%, #d4a62a 45%, #9c7212 100%)",
  sidabrinė: "linear-gradient(135deg, #f4f6f8 0%, #b9bfc6 45%, #7f878f 100%)",
};

export function colorSwatch(name) {
  const value = SWATCHES[key(tidy(name))];
  return value ? { known: true, css: value } : { known: false, css: "" };
}
