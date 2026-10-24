import {
  parseGroups,
  parseColors,
  checkFeasible,
  createDraw,
  encodeTicket,
  decodeTicket,
  vocative,
  dative,
  colorSwatch,
} from "./draw.js";
import { icon } from "./icons.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep going */ }
  },
};

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

function paintIcons(root = document) {
  for (const el of $$("[data-icon]", root)) el.innerHTML = icon(el.dataset.icon);
}

let toastTimer;
function toast(message) {
  const el = $("[data-toast]");
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h("textarea", { readonly: true, style: "position:fixed;opacity:0" });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function applySwatch(el, colorName) {
  const swatch = colorSwatch(colorName);
  el.classList.toggle("swatch-unknown", !swatch.known);
  el.style.setProperty("--swatch", swatch.css || "transparent");
  if (swatch.css.startsWith("linear")) el.style.background = swatch.css;
  else el.style.removeProperty("background");
}

// Theme

function setupTheme() {
  const button = $("[data-theme-toggle]");
  const isDark = () =>
    document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
  const paint = () => {
    button.innerHTML = icon(isDark() ? "sun" : "moon");
    button.setAttribute("aria-label", isDark() ? "Įjungti šviesų režimą" : "Įjungti tamsų režimą");
  };
  button.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("kt:theme", next); } catch { /* ignore */ }
    paint();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint);
  paint();
}

// Routing

function show(name) {
  for (const view of $$("[data-view]")) view.hidden = view.dataset.view !== name;
  $("[data-org-link]").hidden = name === "ticket" || name === "organizer";
  $("[data-toast]").classList.remove("is-visible");
  window.scrollTo(0, 0);
}

function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === "organizatorius") {
    document.title = "Traukimo paruošimas | Kalėdų traukimas";
    show("organizer");
    renderOrganizer();
  } else if (hash.startsWith("k=")) {
    const ticket = decodeTicket(hash.slice(2));
    if (ticket) {
      showTicket(ticket);
    } else {
      document.title = "Nuoroda neveikia | Kalėdų traukimas";
      show("invalid");
    }
  } else {
    document.title = "Kalėdų traukimas";
    show("home");
  }
}

// Participant

let revealing = false;

function showTicket(ticket) {
  const voc = vocative(ticket.g);
  const seenKey = `kt:seen:${ticket.d}:${ticket.g}`;
  const seen = store.get(seenKey, false);
  const view = $('[data-view="ticket"]');
  const gift = $("[data-gift]", view);
  const result = $("[data-result]", view);

  document.title = `Labas, ${voc}! | Kalėdų traukimas`;
  $("[data-voc]", view).textContent = voc;
  $("[data-receiver]", view).textContent = dative(ticket.r);
  $("[data-color]", view).textContent = ticket.c || "Bet kokia";
  applySwatch($("[data-swatch]", view), ticket.c);
  $("[data-ticket-lead]", view).textContent = seen
    ? "Jau traukei. Jei pamiršai, ką ištraukei, išpakuok dovaną dar kartą."
    : "Tavo dovana jau laukia. Išpakuok ją ir sužinok, kam šiemet ruoši dovaną ir kokios spalvos ji bus.";
  $("[data-draw-label]", view).textContent = seen ? "Pažiūrėti dar kartą" : "Traukti";

  gift.hidden = false;
  gift.classList.remove("is-shaking", "is-open");
  result.hidden = true;
  $("[data-draw-actions]", view).hidden = false;
  $("[data-remind]", view).hidden = true;
  show("ticket");

  const reveal = async () => {
    if (revealing) return;
    revealing = true;
    $("[data-draw]", view).disabled = true;
    if (!reducedMotion()) {
      gift.classList.add("is-shaking");
      await wait(300);
      gift.classList.remove("is-shaking");
      gift.classList.add("is-open");
      burst(gift.parentElement);
      await wait(260);
    }
    gift.hidden = true;
    result.hidden = false;
    result.classList.add("is-entering");
    result.addEventListener("animationend", () => result.classList.remove("is-entering"), { once: true });
    result.focus({ preventScroll: true });
    result.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    $("[data-ticket-lead]", view).textContent = "Linksmų šv. Kalėdų! Dabar laikas ieškoti dovanos.";
    $("[data-draw-actions]", view).hidden = true;
    $("[data-remind]", view).hidden = false;
    $("[data-draw]", view).disabled = false;
    store.set(seenKey, true);
    revealing = false;
  };

  gift.onclick = reveal;
  $("[data-draw]", view).onclick = reveal;

  $("[data-remind]", view).onsubmit = (event) => {
    event.preventDefault();
    const input = $("#remind-email");
    const email = input.value.trim();
    if (email && !input.checkValidity()) {
      input.setAttribute("aria-invalid", "true");
      toast("Patikrink el. pašto adresą");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    const subject = "Mano Kalėdų traukimas";
    const body = [
      `Labas, ${voc}!`,
      "",
      `Šiemet dovaną ruoši: ${dative(ticket.r)}`,
      `Dovanos spalva: ${ticket.c || "bet kokia"}`,
      "",
      `Tavo traukimas: ${location.href}`,
      "",
      "Linksmų šv. Kalėdų!",
    ].join("\r\n");
    location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
}

function burst(container) {
  if (reducedMotion()) return;
  const layer = h("div", { class: "burst", "aria-hidden": "true" });
  for (let i = 0; i < 22; i++) {
    const angle = (Math.PI * 2 * i) / 22 + Math.random() * 0.3;
    const distance = 110 + Math.random() * 120;
    const flake = h("span", { html: icon(i % 4 === 0 ? "sparkle" : "snowflake") });
    flake.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    flake.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    flake.style.setProperty("--s", (0.9 + Math.random() * 0.9).toFixed(2));
    flake.style.setProperty("--r", `${Math.round(Math.random() * 240 - 120)}deg`);
    flake.style.setProperty("--delay", `${Math.round(Math.random() * 80)}ms`);
    flake.style.fontSize = `${1 + Math.random() * 0.7}rem`;
    layer.append(flake);
  }
  container.append(layer);
  setTimeout(() => layer.remove(), 900);
}

// Organizer

const ORG_KEY = "kt:organizer";
const org = store.get(ORG_KEY, { people: "", colors: "", draw: null, emails: {}, sent: {} });
const saveOrg = () => store.set(ORG_KEY, org);
let organizerReady = false;

const linkFor = (token) => `${location.origin}${location.pathname}#k=${token}`;
const inviteText = (name) =>
  `Labas, ${vocative(name)}! Kalėdų traukimas jau prasidėjo. Atidaryk savo asmeninę nuorodą ir sužinok, kam šiemet ruoši dovaną. Niekam jos nepersiųsk.`;

function renderOrganizer() {
  const form = $("[data-org-form]");
  const people = $("#people", form);
  const colors = $("#colors", form);
  if (!organizerReady) {
    organizerReady = true;
    people.value = org.people;
    colors.value = org.colors;
    form.addEventListener("input", () => {
      org.people = people.value;
      org.colors = colors.value;
      saveOrg();
      renderPreview();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      generate();
    });
    $("[data-copy-all]").addEventListener("click", copyAll);
    $("[data-reset]").addEventListener("click", () => {
      if (!confirm("Ištrinti šį traukimą? Visiems reikės išsiųsti naujas nuorodas.")) return;
      org.draw = null;
      org.sent = {};
      saveOrg();
      renderPreview();
      renderLinks();
    });
  }
  renderPreview();
  renderLinks();
}

function readForm() {
  const parsed = parseGroups(org.people);
  const colorList = parseColors(org.colors);
  return { ...parsed, colors: colorList };
}

function renderPreview() {
  const { groups, people, errors, colors } = readForm();
  const peoplePreview = $("[data-people-preview]");
  peoplePreview.replaceChildren(
    ...groups.map((g) =>
      h("span", { class: "household", title: g.length > 1 ? "Negali traukti vienas kito" : null },
        ...g.map((name) => h("span", { class: "chip" }, name)))),
  );
  const colorPreview = $("[data-colors-preview]");
  colorPreview.replaceChildren(
    ...colors.map((c) => {
      const sw = h("span", { class: "swatch" });
      applySwatch(sw, c);
      return h("span", { class: "chip" }, sw, c);
    }),
  );

  const status = $("[data-status]");
  status.className = "form-status";
  const feasible = checkFeasible(groups);
  const canDraw = people.length > 0 && !errors.length && feasible.ok && colors.length > 0;
  let message = "";
  let state = "";
  if (!people.length) {
    message = "Įrašyk dalyvius, kad galėtum traukti.";
  } else if (errors.length) {
    [message, state] = [errors[0], "is-error"];
  } else if (!feasible.ok) {
    [message, state] = [feasible.reason, "is-error"];
  } else if (!colors.length) {
    [message, state] = ["Įrašyk bent vieną spalvą.", "is-error"];
  } else if (org.draw && org.draw.signature !== signature()) {
    [message, state] = ["Sąrašas pasikeitė po traukimo. Ištrauk burtus iš naujo.", "is-error"];
  } else {
    const repeat = colors.length < people.length ? " Spalvos kartosis." : "";
    const counts = `${plural(people.length, "dalyvis", "dalyviai", "dalyvių")}, ${plural(colors.length, "spalva", "spalvos", "spalvų")}`;
    [message, state] = [`${counts}.${repeat} Galima traukti.`, "is-ok"];
  }
  status.textContent = message;
  if (state) status.classList.add(state);
  $("[data-generate]").disabled = !canDraw;
}

// 1 dalyvis, 2-9 dalyviai, 10-20 and round tens dalyvių.
function plural(n, one, few, many) {
  const tens = n % 100;
  const word = n % 10 === 1 && tens !== 11 ? one : n % 10 >= 2 && (tens < 10 || tens > 20) ? few : many;
  return `${n} ${word}`;
}

const signature = () => JSON.stringify([parseGroups(org.people).groups, parseColors(org.colors)]);

function generate() {
  const { groups, errors, colors } = readForm();
  const feasible = checkFeasible(groups);
  if (errors.length || !feasible.ok || !colors.length) return renderPreview();
  if (org.draw && !confirm("Traukimas jau yra. Ištraukus iš naujo, visiems reikės išsiųsti naujas nuorodas. Tęsti?")) return;
  const draw = createDraw(groups, colors);
  // Only the encoded links are kept, so the pairs never sit in plain sight on this device.
  org.draw = {
    id: draw.id,
    createdAt: draw.createdAt,
    signature: signature(),
    links: draw.tickets.map((t) => ({ name: t.g, token: encodeTicket(t) })),
  };
  org.sent = {};
  saveOrg();
  renderPreview();
  renderLinks();
  toast("Burtai ištraukti");
  $("[data-links]").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
}

function markSent(name) {
  org.sent[name] = true;
  saveOrg();
  renderLinks();
}

function renderLinks() {
  const section = $("[data-links]");
  if (!org.draw) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const { links, createdAt } = org.draw;
  const sentCount = links.filter((l) => org.sent[l.name]).length;
  const date = new Date(createdAt).toLocaleDateString("lt-LT", { month: "long", day: "numeric" });
  $("[data-links-meta]").textContent = `Ištraukta ${date}, išsiųsta ${sentCount} iš ${links.length}.`;

  const canShare = typeof navigator.share === "function";
  $("[data-link-list]").replaceChildren(
    ...links.map(({ name, token }) => {
      const url = linkFor(token);
      const emailId = `email-${token.slice(0, 8)}`;
      const mail = h("a", { class: "btn btn-secondary", href: "#" }, h("span", { html: icon("envelope-simple") }), "El. paštu");
      const updateMail = (email) => {
        const body = `${inviteText(name)}\r\n\r\n${url}\r\n\r\nLinksmų šv. Kalėdų!`;
        mail.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Tavo Kalėdų traukimas")}&body=${encodeURIComponent(body)}`;
      };
      const input = h("input", {
        id: emailId, type: "email", inputmode: "email", autocomplete: "off",
        placeholder: "El. paštas (nebūtina)", "aria-label": `${name} el. paštas`,
        oninput: (e) => { org.emails[name] = e.target.value.trim(); saveOrg(); updateMail(org.emails[name]); },
      });
      input.value = org.emails[name] || "";
      updateMail(input.value);
      mail.addEventListener("click", () => setTimeout(() => markSent(name), 300));

      const actions = h("div", { class: "link-actions" },
        canShare && h("button", {
          class: "btn btn-primary", type: "button",
          onclick: async () => {
            try {
              await navigator.share({ title: "Kalėdų traukimas", text: inviteText(name), url });
              markSent(name);
            } catch { /* closed the share sheet */ }
          },
        }, h("span", { html: icon("share-network") }), "Dalintis"),
        mail,
        h("button", {
          class: "btn btn-secondary", type: "button",
          onclick: async () => {
            if (await copyText(`${inviteText(name)}\n${url}`)) {
              toast(`${name}: nuoroda nukopijuota`);
              markSent(name);
            } else {
              toast("Nepavyko nukopijuoti");
            }
          },
        }, h("span", { html: icon("copy") }), "Kopijuoti"),
      );

      return h("li", { class: "link-row" },
        h("div", { class: "link-who" },
          h("span", { class: "avatar", "aria-hidden": "true" }, name.slice(0, 1).toLocaleUpperCase("lt")),
          h("span", {}, name),
          org.sent[name] && h("span", { class: "sent" }, h("span", { html: icon("check") }), "išsiųsta")),
        input,
        actions);
    }),
  );
}

async function copyAll() {
  if (!org.draw) return;
  const text = org.draw.links.map(({ name, token }) => `${name}: ${linkFor(token)}`).join("\n");
  toast((await copyText(text)) ? "Visos nuorodos nukopijuotos" : "Nepavyko nukopijuoti");
}

// Boot

$$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
paintIcons();
setupTheme();
window.addEventListener("hashchange", route);
route();
