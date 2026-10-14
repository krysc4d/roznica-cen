import {
  parseMoney,
  formatMoney,
  parsePercentTenths,
  computeItem,
} from "./calc.js";

const STORAGE_KEY = "roznica-cen:lista:v1";

const $ = (id) => document.getElementById(id);
const el = {
  form: $("form"),
  name: $("name"),
  qty: $("qty"),
  shelf: $("shelf"),
  promo: $("promo"),
  pmN: $("pm-n"),
  pmTotal: $("pm-total"),
  pfX: $("pf-x"),
  pfY: $("pf-y"),
  ppP: $("pp-p"),
  paid: $("paid"),
  paidTotal: $("paid-total"),
  error: $("error"),
  result: $("result"),
  rOwed: $("r-owed"),
  rPaid: $("r-paid"),
  rLabel: $("r-label"),
  rPayout: $("r-payout"),
  add: $("add"),
  clearForm: $("clear-form"),
  empty: $("empty"),
  list: $("list"),
  totalBox: $("total-box"),
  total: $("total"),
  clearList: $("clear-list"),
  groups: {
    multi_price: $("promo-multi"),
    free: $("promo-free"),
    second_percent: $("promo-percent"),
    percent: $("promo-percent"),
  },
};

/** @type {Array<{name:string, qty:number, owed:number, paid:number, payout:number, promoLabel:string}>} */
let items = loadItems();

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveItems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* pamięć przeglądarki może być niedostępna, aplikacja działa dalej */
  }
}

function isBlank(v) {
  return v.trim() === "";
}

function readIntOrNull(input) {
  const s = input.value.trim();
  return /^\d+$/.test(s) ? parseInt(s, 10) : null;
}

function promoLabel(promo) {
  switch (promo.type) {
    case "multi_price":
      return `${promo.n} szt. za ${formatMoney(promo.total)}`;
    case "free":
      return `${promo.x}+${promo.y} gratis`;
    case "second_percent":
      return `-${promo.tenths / 10}% na drugą sztukę`.replace(".", ",");
    case "percent":
      return `-${promo.tenths / 10}% na produkt`.replace(".", ",");
    default:
      return "";
  }
}

/** Czyta pola formularza. Zwraca { item, touched } gdzie item jest gotowy do computeItem. */
function readForm() {
  const type = el.promo.value;
  let promo = { type: "none" };
  if (type === "multi_price") {
    promo = { type, n: readIntOrNull(el.pmN), total: parseMoney(el.pmTotal.value) };
  } else if (type === "free") {
    promo = { type, x: readIntOrNull(el.pfX), y: readIntOrNull(el.pfY) };
  } else if (type === "second_percent" || type === "percent") {
    promo = { type, tenths: parsePercentTenths(el.ppP.value) };
  }
  return {
    qty: readIntOrNull(el.qty),
    shelfUnit: parseMoney(el.shelf.value),
    promo,
    paidUnit: parseMoney(el.paid.value),
    paidTotal: isBlank(el.paidTotal.value) ? null : parseMoney(el.paidTotal.value),
  };
}

function setInvalid(input, invalid) {
  if (invalid) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function showPromoFields() {
  const type = el.promo.value;
  const visible = new Set();
  if (el.groups[type]) visible.add(el.groups[type]);
  new Set(Object.values(el.groups)).forEach((g) => (g.hidden = !visible.has(g)));
}

/** Zwraca komunikat, gdy wypełnione pole promocji ma niepoprawną wartość. */
function promoFieldsBroken() {
  const type = el.promo.value;
  const bad = (input, ok) => !isBlank(input.value) && !ok;
  if (type === "multi_price") {
    if (bad(el.pmN, readIntOrNull(el.pmN) >= 2)) return "Popraw liczbę sztuk w promocji (min. 2).";
    if (bad(el.pmTotal, parseMoney(el.pmTotal.value) !== null)) return "Popraw kwotę promocji (np. 10,00).";
  } else if (type === "free") {
    if (bad(el.pfX, readIntOrNull(el.pfX) >= 1)) return "Popraw liczbę płatnych sztuk (X).";
    if (bad(el.pfY, readIntOrNull(el.pfY) >= 1)) return "Popraw liczbę sztuk gratis (Y).";
  } else if (type === "second_percent" || type === "percent") {
    if (bad(el.ppP, parsePercentTenths(el.ppP.value) !== null)) return "Popraw rabat procentowy (od 0,1 do 99,9).";
  }
  return null;
}

let lastResult = null;
let lastItem = null;

function update() {
  const item = readForm();
  const anyInput =
    !isBlank(el.shelf.value) || !isBlank(el.paid.value) || !isBlank(el.paidTotal.value);

  setInvalid(el.qty, !isBlank(el.qty.value) && item.qty === null);
  setInvalid(el.shelf, !isBlank(el.shelf.value) && item.shelfUnit === null);
  setInvalid(el.paid, !isBlank(el.paid.value) && item.paidUnit === null);
  setInvalid(el.paidTotal, !isBlank(el.paidTotal.value) && item.paidTotal === null);

  // Wypełnione, ale niepoprawne pole to błąd do poprawy. Nie licz po cichu z innych pól.
  const promoBroken = promoFieldsBroken();
  let result;
  if (!isBlank(el.qty.value) && item.qty === null) {
    result = { ok: false, error: "Popraw ilość (liczba całkowita, np. 2)." };
  } else if (!isBlank(el.shelf.value) && item.shelfUnit === null) {
    result = { ok: false, error: "Popraw cenę z półki (np. 12,99)." };
  } else if (promoBroken) {
    result = { ok: false, error: promoBroken };
  } else if (!isBlank(el.paid.value) && item.paidUnit === null) {
    result = { ok: false, error: "Popraw cenę z paragonu (np. 12,99)." };
  } else if (!isBlank(el.paidTotal.value) && item.paidTotal === null) {
    result = { ok: false, error: "Popraw kwotę zapłaconą łącznie (np. 12,99)." };
  } else {
    result = computeItem(item);
  }

  lastResult = result;
  lastItem = item;

  if (!anyInput) {
    el.error.hidden = true;
    el.result.hidden = true;
    el.add.disabled = true;
    return;
  }

  if (!result.ok) {
    el.error.textContent = result.error;
    el.error.hidden = false;
    el.result.hidden = true;
    el.add.disabled = true;
    return;
  }

  el.error.hidden = true;
  el.result.hidden = false;
  el.result.dataset.status = result.status;
  el.rOwed.textContent = formatMoney(result.owed);
  el.rPaid.textContent = formatMoney(result.paid);
  if (result.status === "mniej") {
    el.rLabel.textContent = "Na paragonie taniej niż na półce";
    el.rPayout.textContent = formatMoney(0);
  } else if (result.status === "zgodnie") {
    el.rLabel.textContent = "Ceny zgodne, nic do wypłaty";
    el.rPayout.textContent = formatMoney(0);
  } else {
    el.rLabel.textContent = "Do wypłaty";
    el.rPayout.textContent = formatMoney(result.payout);
  }
  el.add.disabled = false;
}

function renderList() {
  el.list.textContent = "";
  items.forEach((it, index) => {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "li-name";
    name.textContent = it.name || `Pozycja ${index + 1}`;

    const amount = document.createElement("span");
    amount.className = "li-amount";
    amount.textContent = formatMoney(it.payout);

    const detail = document.createElement("span");
    detail.className = "li-detail";
    const parts = [`${it.qty} szt.`, `należało ${formatMoney(it.owed)}`, `zapłacono ${formatMoney(it.paid)}`];
    if (it.promoLabel) parts.push(it.promoLabel);
    detail.textContent = parts.join(", ");

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "li-remove";
    remove.textContent = "Usuń";
    remove.setAttribute("aria-label", `Usuń pozycję ${it.name || index + 1}`);
    remove.addEventListener("click", () => {
      items.splice(index, 1);
      saveItems();
      renderList();
    });

    li.append(name, amount, detail, remove);
    el.list.append(li);
  });

  const has = items.length > 0;
  el.empty.hidden = has;
  el.totalBox.hidden = !has;
  el.clearList.hidden = !has;
  if (has) {
    const total = items.reduce((acc, it) => acc + it.payout, 0);
    el.total.textContent = formatMoney(total);
  }
}

function resetForm() {
  el.form.reset();
  el.qty.value = "1";
  showPromoFields();
  update();
  el.shelf.focus();
}

el.form.addEventListener("input", update);
el.promo.addEventListener("change", () => {
  showPromoFields();
  update();
});

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  update();
  if (!lastResult || !lastResult.ok) return;
  items.push({
    name: el.name.value.trim(),
    qty: lastItem.qty,
    owed: lastResult.owed,
    paid: lastResult.paid,
    payout: lastResult.payout,
    promoLabel: promoLabel(lastItem.promo),
  });
  saveItems();
  renderList();
  resetForm();
});

el.clearForm.addEventListener("click", resetForm);

el.clearList.addEventListener("click", () => {
  if (!window.confirm("Wyczyścić całą listę?")) return;
  items = [];
  saveItems();
  renderList();
});

showPromoFields();
update();
renderList();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline działa tylko po poprawnej rejestracji, ale aplikacja działa i bez tego */
    });
  });
}
