import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGroups,
  parseColors,
  checkFeasible,
  drawPairs,
  createDraw,
  encodeTicket,
  decodeTicket,
  vocative,
  dative,
  colorSwatch,
} from "../assets/draw.js";

const FAMILY = `Negali ištraukti vienas kito:
Paula + Antanas
Loreta + Darius + Babutė.
Sandra + Romas
Aušrinė + Petras
Deivis + Skaistė`;

const COLORS = `Spalvos:

Balta
Žydra
Raudona
Geltona
Žalia
Mėlyna
Ruda
Oranžinė
Rožinė
Auksinė
Sidabrinė
(edited)`;

test("parseGroups reads households and ignores header lines and trailing dots", () => {
  const { people, groups, errors } = parseGroups(FAMILY);
  assert.deepEqual(errors, []);
  assert.equal(people.length, 11);
  assert.deepEqual(groups[1], ["Loreta", "Darius", "Babutė"]);
});

test("parseGroups accepts commas and 'ir' as separators and single people", () => {
  const { groups } = parseGroups("Ona, Jonas\nRasa ir Tomas\nGintarė");
  assert.deepEqual(groups, [["Ona", "Jonas"], ["Rasa", "Tomas"], ["Gintarė"]]);
});

test("parseGroups reports duplicate names", () => {
  const { errors } = parseGroups("Ona + Jonas\nona");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Ona/);
});

test("parseColors drops headers, blanks and Slack noise", () => {
  const colors = parseColors(COLORS);
  assert.equal(colors.length, 11);
  assert.equal(colors[0], "Balta");
  assert.equal(colors.at(-1), "Sidabrinė");
});

test("checkFeasible rejects a household larger than half of everyone", () => {
  assert.equal(checkFeasible([["A", "B", "C"], ["D"]]).ok, false);
  assert.equal(checkFeasible([["A"]]).ok, false);
  assert.equal(checkFeasible(parseGroups(FAMILY).groups).ok, true);
});

test("drawPairs never pairs a person with themselves or their household, over many runs", () => {
  const { groups } = parseGroups(FAMILY);
  const household = new Map(groups.flatMap((g, i) => g.map((n) => [n, i])));
  for (let run = 0; run < 2000; run++) {
    const pairs = drawPairs(groups);
    const givers = Object.keys(pairs);
    const receivers = Object.values(pairs);
    assert.equal(givers.length, 11);
    assert.equal(new Set(receivers).size, 11, "everyone receives exactly one gift");
    for (const [giver, receiver] of Object.entries(pairs)) {
      assert.notEqual(giver, receiver);
      assert.notEqual(household.get(giver), household.get(receiver), `${giver} -> ${receiver}`);
    }
  }
});

test("createDraw gives every person a distinct colour when there are enough colours", () => {
  const { groups } = parseGroups(FAMILY);
  const draw = createDraw(groups, parseColors(COLORS));
  assert.equal(draw.tickets.length, 11);
  assert.equal(new Set(draw.tickets.map((t) => t.c)).size, 11);
  assert.ok(draw.tickets.every((t) => t.d === draw.id));
});

test("tickets round-trip through the link encoding, including Lithuanian letters", () => {
  const ticket = { d: "x7k2qa", g: "Babutė", r: "Aušrinė", c: "Žydra" };
  const encoded = encodeTicket(ticket);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(encoded, /Aušrin|QXXz/);
  assert.deepEqual(decodeTicket(encoded), ticket);
});

test("decodeTicket rejects tampered or garbage links", () => {
  const encoded = encodeTicket({ d: "abc", g: "Ona", r: "Jonas", c: "Balta" });
  const tampered = (encoded[3] === "A" ? "B" : "A");
  assert.equal(decodeTicket(encoded.slice(0, 3) + tampered + encoded.slice(4)), null);
  assert.equal(decodeTicket("hello"), null);
  assert.equal(decodeTicket(""), null);
});

test("Lithuanian name forms", () => {
  const cases = [
    ["Paula", "Paula", "Paulai"],
    ["Antanas", "Antanai", "Antanui"],
    ["Darius", "Dariau", "Dariui"],
    ["Babutė", "Babute", "Babutei"],
    ["Deivis", "Deivi", "Deiviui"],
    ["Skaistė", "Skaiste", "Skaistei"],
    ["Petras", "Petrai", "Petrui"],
    ["Aušrinė", "Aušrine", "Aušrinei"],
  ];
  for (const [name, voc, dat] of cases) {
    assert.equal(vocative(name), voc, `vocative ${name}`);
    assert.equal(dative(name), dat, `dative ${name}`);
  }
});

test("colorSwatch knows the family colours and falls back for unknown ones", () => {
  for (const c of parseColors(COLORS)) assert.ok(colorSwatch(c).known, c);
  assert.equal(colorSwatch("Neoninė").known, false);
});
