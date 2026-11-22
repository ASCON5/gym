// Зал — тренировки. План по кругу через день, записи весов, техника упражнений, календарь с переносом.
// Всё хранится на самом телефоне (localStorage), у каждого на своём; сеть нужна только чтобы открыть первый раз.
//
// Расписание: db.next — какая тренировка следующая и на какой день она стоит. Начал тренировку — next сразу
// становится следующей по кругу через 2 дня от сегодняшней. Перенос меняет только дату next: все дальнейшие
// идут от неё через день, порядок круга не ломается. Пропустили и не перенесли — next «доезжает» до сегодня сама.
(function () {
  "use strict";

  const STORE = "gym.v1";
  const ANCHOR = { day: "UB", date: "2026-11-22" }; // 22.11.2026 — Верх Б: от этого дня считается круг
  const CYCLE = DAYS.map((d) => d.id);
  const DAY = new Map(DAYS.map((d) => [d.id, d]));
  const TAG = { base: "База", iso: "Изоляция", extra: "Доп.", core: "Кор" };
  const REST = { base: PROGRAM.restBase, iso: PROGRAM.restIso, extra: PROGRAM.restIso, core: PROGRAM.restIso };
  const REST_LABEL = { base: "2–3 мин", iso: "60–90 сек", extra: "60–90 сек", core: "60–90 сек" };
  const PRESET = [
    { id: "ihtiyar", name: "Ихтияр" },
    { id: "asadbek", name: "Асадбек" },
    { id: "jamshid", name: "Джамшид" },
  ];
  const FRONT = new Set(["1", "2", "3", "4", "6", "10", "13", "14"]);
  const RE_DATE = /^\d{4}-\d\d-\d\d$/;

  // ---------- даты ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ds = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const pd = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const today = () => ds(new Date());
  const addDays = (s, n) => {
    const d = pd(s);
    d.setDate(d.getDate() + n);
    return ds(d);
  };
  const diff = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
  const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const MONTH = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fdate = (s) => {
    const d = pd(s);
    return WD[d.getDay()] + ", " + d.getDate() + " " + MON[d.getMonth()];
  };
  const sdate = (s) => {
    const d = pd(s);
    return d.getDate() + "." + pad(d.getMonth() + 1);
  };
  // «сегодня», «завтра», «послезавтра» или «чт, 26 ноября»
  function rel(s) {
    const n = diff(today(), s);
    if (n === 0) return "сегодня";
    if (n === 1) return "завтра";
    if (n === 2) return "послезавтра";
    if (n === -1) return "вчера";
    return fdate(s);
  }
  const relFull = (s) => {
    const n = diff(today(), s);
    return n >= 1 && n <= 2 ? rel(s) + ", " + fdate(s) : rel(s);
  };
  function plural(n, one, few, many) {
    const d = n % 10;
    const h = n % 100;
    if (d === 1 && h !== 11) return one;
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
    return many;
  }

  // ---------- числа ----------
  const fw = (n) => (Math.round(n * 100) / 100).toString().replace(".", ",");
  function num(v) {
    const s = String(v).trim().replace(",", ".").replace(/[^\d.]/g, "");
    if (!s) return null;
    const n = parseFloat(s);
    return isFinite(n) && n >= 0 && n < 1000 ? Math.round(n * 100) / 100 : null;
  }
  function int(v) {
    const s = String(v).replace(/\D/g, "");
    if (!s) return null;
    const n = parseInt(s, 10);
    return n > 0 && n < 1000 ? n : null;
  }
  const reps = (it) => (it.reps[0] === it.reps[1] ? String(it.reps[0]) : it.reps[0] + "–" + it.reps[1]);
  const fset = (x) => (x.w != null ? fw(x.w) + " × " + x.r : x.r + " раз");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const $ = (sel, root) => (root || document).querySelector(sel);

  // ---------- иконки ----------
  const P = {
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19"/><path d="M9 7.5h6M9 11h4"/>',
    more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="2.8"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.3 2.3M9.5 2.8h5"/>',
    up: '<path d="M12 19V6M6.5 11.5L12 6l5.5 5.5"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4v.1"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
    pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
    fire: '<path d="M12 21.5c3.9 0 6.8-2.7 6.8-6.6 0-3.4-2.3-5.8-3.8-7.7-.5 1.9-1.4 2.9-2.8 2.9 0-2.9-1-5.3-2.9-6.6-.5 2.9-4.9 5.8-4.9 11.4 0 3.9 3.4 6.6 7.6 6.6z"/>',
    left: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    right: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    share: '<path d="M12 3.5v12M7.5 8L12 3.5 16.5 8M5 13.5v5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-5"/>',
    save: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
    restore: '<path d="M12 20V9M7.5 13.5L12 9l4.5 4.5M5 4.5h14"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

  // ---------- хранилище ----------
  function fresh() {
    const t = today();
    let next = { day: ANCHOR.day, date: ANCHOR.date };
    const n = diff(ANCHOR.date, t);
    if (n > 0) {
      // Поставили позже 22.11 — считаем, что круг шёл через день, и ставим ближайшую тренировку.
      const k = Math.ceil(n / 2);
      next = { day: CYCLE[(CYCLE.indexOf(ANCHOR.day) + k) % CYCLE.length], date: addDays(ANCHOR.date, 2 * k) };
    }
    return {
      v: 1,
      people: PRESET.map((p) => ({ id: p.id, name: p.name })),
      me: null,
      start: ANCHOR.date,
      next,
      sessions: {},
      active: null,
      work: {},
      notes: {},
      alt: {},
      sound: true,
      hideInstall: false,
    };
  }
  const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  function normalize(v) {
    const d = fresh();
    if (!isObj(v)) return d;
    if (!Array.isArray(v.people)) v.people = d.people;
    v.people = v.people.filter((p) => isObj(p) && typeof p.id === "string" && typeof p.name === "string" && p.name.trim());
    if (!v.people.length) v.people = d.people;
    if (!v.people.some((p) => p.id === v.me)) v.me = null;
    if (typeof v.start !== "string" || !RE_DATE.test(v.start)) v.start = d.start;
    if (!isObj(v.next) || !DAY.has(v.next.day) || typeof v.next.date !== "string" || !RE_DATE.test(v.next.date)) v.next = d.next;
    for (const k of ["sessions", "work", "notes", "alt"]) if (!isObj(v[k])) v[k] = {};
    for (const [id, s] of Object.entries(v.sessions)) {
      if (!isObj(s) || !DAY.has(s.day) || typeof s.date !== "string" || !RE_DATE.test(s.date)) {
        delete v.sessions[id];
        continue;
      }
      s.id = id;
      if (!isObj(s.log)) s.log = {};
      if (!isObj(s.cardio)) s.cardio = {};
      if (!isObj(s.extra)) s.extra = {};
      for (const per of Object.values(s.log))
        if (isObj(per))
          for (const L of Object.values(per)) if (isObj(L)) L.sets = Array.isArray(L.sets) ? L.sets.map((x) => (isObj(x) ? x : {})) : [];
    }
    if (typeof v.active !== "string" || !v.sessions[v.active]) v.active = null;
    if (typeof v.sound !== "boolean") v.sound = true;
    if (typeof v.hideInstall !== "boolean") v.hideInstall = false;
    v.v = 1;
    return v;
  }
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE));
    } catch (e) {
      return null;
    }
  }
  let db = normalize(load());
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(db));
    } catch (e) {
      toast("Не удалось сохранить: память браузера заполнена");
    }
  }
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) {}

  // ---------- люди ----------
  const person = (id) => db.people.find((p) => p.id === id);
  const meName = () => (person(db.me) || { name: "" }).name;
  const initial = (name) => (name.trim()[0] || "?").toUpperCase();
  const mine = (k) => (db[k][db.me] = isObj(db[k][db.me]) ? db[k][db.me] : {});
  const wOf = (ex) => {
    const v = (db.work[db.me] || {})[ex];
    return typeof v === "number" ? v : null;
  };

  // ---------- расписание ----------
  const nextIn = (day, k) => CYCLE[(CYCLE.indexOf(day) + (k === undefined ? 1 : k)) % CYCLE.length];
  const nextDate = () => (db.next.date < today() ? today() : db.next.date);
  const weekOf = (date) => Math.max(1, Math.floor(diff(db.start, date) / 7) + 1);
  function upcomingUntil(end, max) {
    const out = [];
    let d = nextDate();
    for (let i = 0; i < (max || 400) && d <= end; i++, d = addDays(d, 2)) out.push({ day: nextIn(db.next.day, i), date: d });
    return out;
  }
  const upcoming = (n) => upcomingUntil("9999-12-31", n);
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.t0 || 0) - (b.t0 || 0));
  const sessionsOn = (d) => Object.values(db.sessions).filter((s) => s.date === d).sort(byDate);
  const doneList = () => Object.values(db.sessions).filter((s) => s.done).sort(byDate);

  function newSession(day, date) {
    let id = date + "-" + day;
    for (let k = 2; db.sessions[id]; k++) id = date + "-" + day + "-" + k;
    const s = { id, day, date, t0: Date.now(), done: false, log: {}, cardio: {}, extra: {}, prev: { day: db.next.day, date: db.next.date } };
    db.sessions[id] = s;
    db.active = id;
    db.next = { day: nextIn(day), date: addDays(date, 2) };
    save();
    return s;
  }
  function hasAny(s) {
    for (const per of Object.values(s.log)) for (const L of Object.values(per || {})) if (L && L.sets.some((x) => x.ok)) return true;
    return Object.values(s.cardio).some((c) => c && c.ok);
  }
  function finishSession(s) {
    s.done = true;
    s.t1 = Date.now();
    if (db.active === s.id) db.active = null;
    save();
  }
  function dropActive() {
    const s = db.sessions[db.active];
    if (s) {
      if (s.prev && DAY.has(s.prev.day)) db.next = s.prev;
      delete db.sessions[s.id];
    }
    db.active = null;
    save();
  }
  // Тренировка с прошлого дня так и осталась открытой: есть записи — закрываем как сделанную, пустую — убираем.
  function settle() {
    const s = db.active && db.sessions[db.active];
    if (!s) {
      db.active = null;
      return;
    }
    if (s.date >= today()) return;
    if (hasAny(s)) finishSession(s);
    else dropActive();
  }

  // ---------- упражнения тренировки ----------
  const alts = (it) => (Array.isArray(it.ex) ? it.ex : [it.ex]);
  const itemName = (it) => alts(it).map((e) => EX[e].name).join(" / ");
  const prefAlt = (dayId, i, pid) => (db.alt[pid || db.me] || {})[dayId + ":" + i];
  function exOf(s, i) {
    const it = DAY.get(s.day).items[i];
    const L = s.log[db.me] && s.log[db.me][i];
    if (L && L.ex && EX[L.ex]) return L.ex;
    const p = prefAlt(s.day, i);
    return alts(it).includes(p) ? p : alts(it)[0];
  }
  function logOf(s, i, create) {
    let per = s.log[db.me];
    if (!per) {
      if (!create) return null;
      per = s.log[db.me] = {};
    }
    if (!per[i] && create) per[i] = { ex: exOf(s, i), sets: [] };
    return per[i] || null;
  }
  function itemsOf(s) {
    const wk = weekOf(s.date);
    return DAY.get(s.day).items.map((it, i) => ({ i, it, locked: !!(it.from && wk < it.from && !s.extra[i]) }));
  }
  const setsDone = (s, i) => {
    const L = logOf(s, i);
    return L ? L.sets.filter((x) => x.ok).length : 0;
  };
  // Все записи упражнения у этого человека, новые сверху.
  function history(ex, exceptId) {
    const out = [];
    for (const s of Object.values(db.sessions)) {
      if (s.id === exceptId) continue;
      const per = s.log[db.me];
      if (!per) continue;
      for (const [i, L] of Object.entries(per)) {
        if (!L || L.ex !== ex) continue;
        const sets = L.sets.filter((x) => x.ok);
        if (sets.length) out.push({ s, i: +i, sets });
      }
    }
    return out.sort((a, b) => byDate(b.s, a.s));
  }
  const before = (ex, s) => history(ex, s.id).filter((h) => h.s.date <= s.date);
  function bumpWork(s, i) {
    const L = logOf(s, i);
    if (!L) return;
    const ws = L.sets.filter((x) => x.ok && x.w != null).map((x) => x.w);
    if (!ws.length) return;
    if (history(L.ex, s.id).some((h) => h.s.date > s.date)) return; // правят старую запись — рабочий вес не трогаем
    mine("work")[L.ex] = Math.max.apply(null, ws);
  }
  // Что подставить в подход, который ещё не отмечен.
  function prefill(s, i, si) {
    const it = DAY.get(s.day).items[i];
    const L = logOf(s, i);
    const ex = exOf(s, i);
    const st = L && L.sets[si];
    const prev = before(ex, s)[0];
    let w = st && st.w != null ? st.w : null;
    if (w == null && L) for (let k = si - 1; k >= 0 && w == null; k--) if (L.sets[k] && L.sets[k].w != null) w = L.sets[k].w;
    if (w == null) w = wOf(ex);
    if (w == null && prev) w = (prev.sets[si] || prev.sets[prev.sets.length - 1]).w;
    let r = st && st.r != null ? st.r : null;
    if (r == null && prev) r = (prev.sets[si] || prev.sets[prev.sets.length - 1]).r;
    if (r == null) r = it.reps[1];
    return { w, r };
  }
  // Подсказка по карточке 7: база — две тренировки подряд на верх диапазона; изоляция — одна.
  function upHint(it, ex, s) {
    const h = before(ex, s);
    const full = (x) => {
      if (!x || x.sets.length < it.sets) return null;
      const f = x.sets.slice(0, it.sets);
      if (!f.every((y) => y.r >= it.reps[1])) return null;
      const ws = f.map((y) => y.w);
      if (ws.some((w) => w == null)) return { w: null };
      const mx = Math.max.apply(null, ws);
      return ws.every((w) => w === mx) ? { w: mx } : null;
    };
    const a = full(h[0]);
    if (!a) return "";
    const w = wOf(ex);
    if (a.w != null && w != null && w > a.w) return ""; // уже прибавил
    const all = Array(it.sets).fill(it.reps[1]).join("/");
    const good = (t) => `<div class="ex-up">${ic("up")}<span>${t}</span></div>`;
    if (it.type === "base") {
      const b = full(h[1]);
      if (b && b.w === a.w) return good(`Две тренировки подряд ${all}${a.w != null ? " с " + fw(a.w) + " кг" : ""} — пора немного прибавить вес.`);
      return `<div class="ex-up soft">${ic("flag")}<span>В прошлый раз ${all}. Сделай так ещё раз — и можно прибавлять вес.</span></div>`;
    }
    return good(`В прошлый раз ${all} — можно добавить минимальный вес.`);
  }

  // ---------- кардио ----------
  function cardioPlan(day) {
    return { range: day.cardio[db.me] || null, what: CARDIO_WHAT[db.me] || null, avg: CARDIO_AVG[day.kind] };
  }
  function cardioDefault(day) {
    const last = Object.values(db.sessions)
      .filter((s) => DAY.get(s.day).kind === day.kind && s.cardio[db.me] && s.cardio[db.me].ok && s.cardio[db.me].min)
      .sort(byDate)
      .pop();
    if (last) return last.cardio[db.me].min;
    const p = cardioPlan(day);
    if (p.range) {
      const [lo, hi] = p.range.split("–").map(Number);
      return Math.min(hi, Math.max(lo, p.avg));
    }
    return p.avg;
  }
  const cardioText = (day) => {
    const p = cardioPlan(day);
    return (p.range ? p.range : "≈ " + p.avg) + " мин";
  };

  // ---------- картинки ----------
  function mmap(main, sec) {
    const side = (back) => {
      const own = (x) => (x === "2b" ? back : FRONT.has(x) ? !back : back);
      const file = (x) => (x === "2b" ? "2" : x);
      let h = `<img src="m/${back ? "back" : "front"}.svg" alt="" decoding="async">`;
      for (const x of sec || []) if (own(x) && !(main || []).includes(x)) h += `<img src="m/${file(x)}-s.svg" alt="" decoding="async">`;
      for (const x of main || []) if (own(x)) h += `<img src="m/${file(x)}.svg" alt="" decoding="async">`;
      return `<div class="fig">${h}</div>`;
    };
    return `<div class="mmap" aria-hidden="true">${side(false)}${side(true)}</div>`;
  }
  function dayMuscles(day) {
    const m = new Set();
    for (const it of day.items) for (const e of alts(it)) for (const x of EX[e].mm) m.add(x);
    return [...m];
  }
  const art = (ex, cls) => {
    const E = EX[ex];
    return E.art === false
      ? `<div class="art ${cls || "thumb"} mm">${mmap(E.mm, E.ms)}</div>`
      : `<div class="art ${cls || "thumb"}"><img src="art/${ex}-1.svg" alt="" loading="lazy" decoding="async"></div>`;
  };

  // ---------- оболочка ----------
  const app = $("#app");
  const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [a, b] = h.split("/");
    return { a: a || "home", b: b ? decodeURIComponent(b) : "" };
  }
  function go(h) {
    if (location.hash === h) render();
    else location.hash = h;
  }
  const curS = () => {
    const r = route();
    return r.a === "w" ? db.sessions[r.b] || null : null;
  };
  function whoBtn(compact, bare) {
    const n = meName();
    return `<button class="who${bare ? " bare" : ""}" data-act="who" aria-label="Кто тренируется: ${esc(n)}"><span class="ava">${esc(initial(n))}</span>${bare ? "" : esc(compact ? n.split(" ")[0] : n)}</button>`;
  }
  function tabs(cur) {
    const T = [
      ["home", "#/", "Сегодня", "dumbbell"],
      ["cal", "#/cal", "Календарь", "cal"],
      ["plan", "#/plan", "План", "book"],
      ["more", "#/more", "Ещё", "more"],
    ];
    return `<nav class="tabs" aria-label="Разделы">${T.map(([k, h, l, i]) => `<a href="${h}" class="${k === cur ? "on" : ""}"${k === cur ? ' aria-current="page"' : ""}>${ic(i)}<span>${l}</span></a>`).join("")}</nav>`;
  }

  // ---------- экран: первый запуск ----------
  function viewHello() {
    return `<div class="page hello">
      <img class="logo" src="icon-192.png" alt="">
      <h1>Кто тренируется?</h1>
      <p>Выбери себя — веса, заметки и прогресс будут твои. Всё хранится только на этом телефоне.</p>
      <div class="list">${db.people
        .map((p) => `<button class="row" data-act="pick" data-id="${esc(p.id)}"><span class="ava lg">${esc(initial(p.name))}</span><span class="grow t">${esc(p.name)}</span><span class="chev"></span></button>`)
        .join("")}</div>
      <form id="new-person"><input name="n" maxlength="24" placeholder="Другое имя" autocomplete="off" aria-label="Другое имя"><button class="btn primary">Это я</button></form>
    </div>`;
  }

  // ---------- экран: сегодня ----------
  function exList(day, date, s) {
    const wk = weekOf(date);
    return `<div class="list">${day.items
      .map((it, i) => {
        const ex = s ? exOf(s, i) : alts(it).includes(prefAlt(day.id, i)) ? prefAlt(day.id, i) : alts(it)[0];
        const locked = it.from && wk < it.from && !(s && s.extra[i]);
        const w = wOf(ex);
        const done = s && setsDone(s, i) >= it.sets;
        return `<button class="row exrow${locked ? " locked" : ""}" data-act="info" data-ex="${ex}">${art(ex)}
          <div class="grow"><div class="t">${esc(s ? EX[ex].name : itemName(it))}</div>
          <div class="s">${it.sets} × ${reps(it)}${locked ? ` · с ${it.from}-й недели` : w != null ? ` · <span class="wt">${fw(w)} кг</span>` : ""}</div></div>
          ${done ? `<span class="pill ok">${ic("check").replace('stroke-width="2"', 'stroke-width="3" width="14" height="14"')}</span>` : ""}</button>`;
      })
      .join("")}</div>`;
  }
  function viewHome() {
    const t = today();
    const act = db.active && db.sessions[db.active];
    const doneToday = sessionsOn(t).filter((s) => s.done);
    const nd = nextDate();
    const nday = DAY.get(db.next.day);
    const first = meName().split(" ")[0];
    let h = `<div class="page tabbed"><header class="head"><div><div class="eyebrow">${cap(fdate(t))} · неделя ${weekOf(t)} из ${PROGRAM.weeks}</div><h1>Привет, ${esc(first)}</h1></div>${whoBtn(true, true)}</header>`;
    if (!standalone() && !db.hideInstall) h += installCard();

    if (act) {
      const day = DAY.get(act.day);
      const open = itemsOf(act).filter((x) => !x.locked);
      const done = open.filter((x) => setsDone(act, x.i) >= x.it.sets).length;
      h += hero(day, {
        eyebrow: "Идёт тренировка",
        facts: [`${done} из ${open.length} ${plural(open.length, "упражнения", "упражнений", "упражнений")}`, "кардио " + cardioText(day)],
        acts: `<a class="btn primary big" href="#/w/${encodeURIComponent(act.id)}">Продолжить</a>`,
      });
      h += `<h2 class="sec">Упражнения</h2>` + exList(day, act.date, act);
    } else if (nd === t) {
      const overdue = db.next.date < t;
      h += hero(nday, {
        eyebrow: "Сегодня по плану",
        facts: [countEx(nday, t), "кардио " + cardioText(nday)],
        extra: overdue ? `<div class="note">Стояла на ${fdate(db.next.date)} — сдвинулась на сегодня, круг не сбился.</div>` : "",
        acts: `<button class="btn primary big" data-act="start">Начать тренировку</button><button class="btn ghost" data-act="move">Перенести</button><button class="btn ghost" data-act="other">Другая</button>`,
      });
      h += `<h2 class="sec">Упражнения</h2>` + exList(nday, t);
    } else {
      if (doneToday.length) {
        const s = doneToday[doneToday.length - 1];
        h += `<a class="card rest-day" href="#/w/${encodeURIComponent(s.id)}"><span class="ic">${ic("check")}</span><div class="grow"><div class="t" style="font-weight:700">Сегодня сделано: ${esc(DAY.get(s.day).name)}</div><div class="small muted">Отличная работа. Нажми, чтобы посмотреть записи.</div></div><span class="chev"></span></a>`;
      } else {
        h += `<div class="card rest-day"><span class="ic">${ic("moon")}</span><div class="grow"><div style="font-weight:700">Сегодня отдых</div><div class="small muted">${CARDIO_RULES.rest}</div></div></div>`;
      }
      h += `<div style="height:12px"></div>`;
      h += hero(nday, {
        eyebrow: "Следующая · " + relFull(nd),
        facts: [countEx(nday, nd), "кардио " + cardioText(nday)],
        acts: `<button class="btn ghost" data-act="move">Перенести</button><button class="btn ghost" data-act="start">Начать сейчас</button>`,
      });
      h += `<h2 class="sec">Упражнения</h2>` + exList(nday, nd);
    }

    const ups = upcoming(act ? 4 : 5).slice(act ? 0 : 1);
    if (ups.length)
      h += `<h2 class="sec">Дальше по плану</h2><div class="list tl">${ups
        .map((u) => {
          const d = DAY.get(u.day);
          const dd = pd(u.date);
          return `<button class="row" data-act="day" data-date="${u.date}"><span class="date"><b>${dd.getDate()} ${MON[dd.getMonth()].slice(0, 3)}</b><span>${WD[dd.getDay()]}</span></span><span class="grow"><span class="t">${esc(d.name)}</span><span class="s" style="display:block">${esc(d.muscles)}</span></span><span class="dot${d.kind === "low" ? " low" : ""}"></span></button>`;
        })
        .join("")}</div>`;

    const last = doneList().slice(-3).reverse();
    if (last.length)
      h += `<h2 class="sec">Последние тренировки</h2><div class="list">${last
        .map((s) => `<a class="row" href="#/w/${encodeURIComponent(s.id)}"><span class="grow"><span class="t">${esc(DAY.get(s.day).name)}</span><span class="s" style="display:block">${cap(fdate(s.date))} · ${summaryLine(s)}</span></span><span class="chev"></span></a>`)
        .join("")}</div>`;
    return h + `</div>` + tabs("home");
  }
  function countEx(day, date) {
    const wk = weekOf(date);
    const n = day.items.filter((it) => !(it.from && wk < it.from)).length;
    return n + " " + plural(n, "упражнение", "упражнения", "упражнений");
  }
  function summaryLine(s) {
    const per = s.log[db.me] || {};
    const n = Object.values(per).filter((L) => L && L.sets.some((x) => x.ok)).length;
    const c = s.cardio[db.me];
    return n ? n + " " + plural(n, "упражнение", "упражнения", "упражнений") + (c && c.ok ? " · кардио " + c.min + " мин" : "") : "записей нет";
  }
  function hero(day, o) {
    const note = day.notes[db.me];
    return `<section class="hero">
      <div class="hero-main"><div class="hero-text">
        <div class="eyebrow">${o.eyebrow}</div>
        <h2>${esc(day.name)}</h2>
        <div class="mus">${esc(day.muscles)}</div>
        <div class="facts">${o.facts.map((f) => `<span class="fact">${f}</span>`).join("")}</div>
      </div>${mmap(dayMuscles(day), [])}</div>
      ${o.extra || ""}${note ? `<div class="note"><b>${esc(meName())}:</b> ${esc(note)}</div>` : ""}
      <div class="acts">${o.acts}</div>
    </section>`;
  }
  function installCard() {
    return `<div class="card install"><img src="icon-192.png" alt=""><div class="grow"><b>Поставь на экран</b><br><span class="muted">Будет как приложение и без интернета</span></div>
      <button class="btn small" data-act="install">Как?</button><button class="x" data-act="hide-install" aria-label="Скрыть">${ic("x")}</button></div>`;
  }

  // ---------- экран: тренировка ----------
  function viewWork(s) {
    const day = DAY.get(s.day);
    const isAct = db.active === s.id;
    const list = itemsOf(s);
    const open = list.filter((x) => !x.locked);
    const locked = list.filter((x) => x.locked);
    const note = day.notes[db.me];
    let h = `<div class="page work${rest ? " resting" : ""}">
      <header class="top"><a class="back" href="${lastTab}">${lastTab === "#/cal" ? "Календарь" : "Назад"}</a><div class="sp">${esc(day.name)}</div>${whoBtn(true)}<button class="icon-btn" data-act="wmenu" aria-label="Действия с тренировкой">${ic("more")}</button></header>
      <div class="w-head"><div class="eyebrow">${cap(fdate(s.date))} · неделя ${weekOf(s.date)}${s.done ? " · сделано" : ""}</div><h1>${esc(day.name)}</h1>
      <div class="muted">${esc(day.muscles)}</div>${progBar(s)}</div>`;
    if (isAct) h += `<div class="warm">${ic("fire")}<div>${CARDIO_RULES.before}</div></div>`;
    if (note) h += `<div class="alert"><b>${esc(meName())}:</b> ${esc(note)}</div>`;
    h += open.map((x) => card(s, x.i)).join("");
    if (locked.length) h += `<h2 class="sec">Добавятся позже</h2>` + locked.map((x) => lockedCard(s, x)).join("");
    h += cardioCard(s);
    h += isAct
      ? `<button class="btn primary big finish" data-act="finish">Закончить тренировку</button><p class="hint">Всё сохраняется само. Закончил — нажми, и следующая тренировка встанет через день.</p>`
      : `<p class="hint">Изменения сохраняются сами.</p>`;
    return h + `</div>`;
  }
  function progBar(s) {
    const open = itemsOf(s).filter((x) => !x.locked);
    const done = open.filter((x) => setsDone(s, x.i) >= x.it.sets).length;
    const pct = open.length ? Math.round((done / open.length) * 100) : 0;
    return `<div id="prog" style="margin-top:12px"><div class="small muted" style="display:flex;justify-content:space-between"><span>Сделано ${done} из ${open.length}</span><span>${pct}%</span></div><div class="prog"><i style="width:${pct}%"></i></div></div>`;
  }
  function card(s, i) {
    const it = DAY.get(s.day).items[i];
    const ex = exOf(s, i);
    const E = EX[ex];
    const L = logOf(s, i);
    const n = Math.max(it.sets, L ? L.sets.length : 0);
    const prev = before(ex, s)[0];
    const done = setsDone(s, i);
    const note = (db.notes[db.me] || {})[ex];
    let h = `<section class="ex${done >= it.sets ? " done" : ""}" id="ex-${i}" data-i="${i}">
      <div class="ex-h"><button data-act="info" data-ex="${ex}" aria-label="Как делать: ${esc(E.name)}">${art(ex)}</button>
      <div class="ex-t"><span class="tag ${it.type}">${TAG[it.type]}</span><button class="ex-name" data-act="info" data-ex="${ex}">${esc(E.name)}</button>
      <div class="ex-meta"><span>${it.sets} × ${reps(it)}</span><button class="timer-chip" data-act="timer" data-sec="${REST[it.type]}">${ic("timer")}${REST_LABEL[it.type]}</button></div></div>
      <span class="ex-count num">${done}/${it.sets}</span></div>`;
    if (Array.isArray(it.ex))
      h += `<div class="seg" role="group" aria-label="Вариант упражнения">${it.ex.map((a) => `<button data-act="alt" data-ex="${a}" class="${a === ex ? "on" : ""}">${esc(EX[a].name)}</button>`).join("")}</div>`;
    h += prev
      ? `<div class="ex-last">Прошлый раз, ${sdate(prev.s.date)}: <b class="num">${prev.sets.map(fset).join(" · ")}</b></div>`
      : `<div class="ex-last">Первый раз: впиши вес, с которым делаешь, — в следующий раз он будет здесь.</div>`;
    h += upHint(it, ex, s);
    h += `<div class="sets">`;
    for (let si = 0; si < n; si++) h += setRow(s, i, si, it);
    h += `</div><div class="ex-f"><button class="link" data-act="addset">+ подход</button>${
      L && L.sets.length > it.sets && !L.sets[L.sets.length - 1].ok ? `<button class="link" data-act="delset">− подход</button>` : ""
    }<button class="ex-note" data-act="info" data-ex="${ex}">${note ? "📝 " + esc(note) : ""}</button></div></section>`;
    return h;
  }
  function setRow(s, i, si, it) {
    const L = logOf(s, i);
    const st = L && L.sets[si];
    const ok = !!(st && st.ok);
    const p = prefill(s, i, si);
    return `<div class="set${ok ? " ok" : ""}" data-s="${si}"><span class="sn">${si + 1}</span>
      <label class="fld"><input class="w" type="text" inputmode="decimal" autocomplete="off" value="${p.w == null ? "" : fw(p.w)}" placeholder="вес" aria-label="Вес, подход ${si + 1}"><span>кг</span></label>
      <span class="x">×</span>
      <label class="fld"><input class="r" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${p.r == null ? "" : p.r}" placeholder="${reps(it)}" aria-label="Повторы, подход ${si + 1}"><span>раз</span></label>
      <button class="chk" data-act="set" aria-label="${ok ? "Снять отметку" : "Подход сделан"}" aria-pressed="${ok}">${ic("check")}</button></div>`;
  }
  function lockedCard(s, x) {
    const it = x.it;
    const ex = exOf(s, x.i);
    return `<section class="ex locked" id="ex-${x.i}" data-i="${x.i}"><div class="ex-h"><button data-act="info" data-ex="${ex}" aria-label="Как делать">${art(ex)}</button>
      <div class="ex-t"><span class="tag ${it.type}">${TAG[it.type]}</span><button class="ex-name" data-act="info" data-ex="${ex}">${esc(EX[ex].name)}</button>
      <div class="ex-meta">${it.sets} × ${reps(it)} · с ${it.from}-й недели${it.soft ? ", если восстановление хорошее" : ""}</div></div></div>
      <button class="btn small" data-act="unlock">Сделать сегодня</button></section>`;
  }
  function cardioCard(s) {
    const day = DAY.get(s.day);
    const c = s.cardio[db.me];
    const ok = !!(c && c.ok);
    const p = cardioPlan(day);
    const val = c && c.min ? c.min : cardioDefault(day);
    const rules = db.me === "ihtiyar" ? `<div class="alert" style="margin:12px 0 0"><b>Ихтияр:</b><ul>${CARDIO_RULES.ihtiyar.map((r) => `<li>${r}</li>`).join("")}</ul></div>` : "";
    return `<section class="ex cardio${ok ? " done" : ""}" id="cardio"><div class="ex-h"><div class="art thumb" style="display:grid;place-items:center;color:var(--accent)">${ic("pulse").replace("<svg", '<svg style="width:30px;height:30px"')}</div>
      <div class="ex-t"><span class="tag cardio">Кардио</span><div class="ex-name">${esc(p.what || "Кардио после тренировки")}</div>
      <div class="ex-meta">${p.range ? `${esc(meName())}: ${p.range} мин` : `в среднем ${p.avg} мин`} · после силовой</div></div></div>
      <div class="sets"><div class="set${ok ? " ok" : ""}"><span class="sn">${ic("timer")}</span><label class="fld"><input class="cm" type="text" inputmode="numeric" pattern="[0-9]*" value="${val}" aria-label="Минуты кардио"><span>мин</span></label>
      <button class="chk" data-act="cardio" aria-label="Кардио сделано" aria-pressed="${ok}">${ic("check")}</button></div></div>${rules}</section>`;
  }
  function redrawCard(s, i) {
    const el = document.getElementById("ex-" + i);
    if (el) el.outerHTML = card(s, i);
    const pr = document.getElementById("prog");
    if (pr) pr.outerHTML = progBar(s);
  }

  // ---------- экран: календарь ----------
  let calM = "";
  function viewCal() {
    const t = today();
    if (!calM) calM = t.slice(0, 7);
    const [y, m] = calM.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7;
    const nDays = new Date(y, m, 0).getDate();
    const plan = {};
    for (const u of upcomingUntil(calM + "-" + pad(nDays))) plan[u.date] = u;
    const by = {};
    for (const s of Object.values(db.sessions)) (by[s.date] = by[s.date] || []).push(s);
    let cells = "";
    for (let k = 0; k < lead; k++) cells += `<span class="d blank"></span>`;
    for (let d = 1; d <= nDays; d++) {
      const date = calM + "-" + pad(d);
      const ss = by[date];
      const pl = plan[date];
      let cls = "d";
      let k = "";
      let lab = d + " " + MON[m - 1];
      if (date < t) cls += " past";
      if (date === t) cls += " today";
      if (ss && ss.length) {
        const s = ss.sort(byDate)[ss.length - 1];
        const dd = DAY.get(s.day);
        cls += (s.done ? " f" : " a") + (dd.kind === "low" ? " low" : "");
        k = dd.short;
        lab += ", " + dd.name + (s.done ? ", сделано" : ", идёт");
      } else if (pl) {
        const dd = DAY.get(pl.day);
        cls += " p" + (dd.kind === "low" ? " low" : "");
        k = dd.short;
        lab += ", по плану " + dd.name;
      }
      cells += `<button class="${cls}" data-act="day" data-date="${date}" aria-label="${lab}"><span class="n">${d}</span><span class="k">${k}</span></button>`;
    }
    const monthDone = doneList().filter((s) => s.date.slice(0, 7) === calM);
    let h = `<div class="page tabbed"><header class="head"><div><div class="eyebrow">Неделя ${weekOf(t)} из ${PROGRAM.weeks}</div><h1>Календарь</h1></div>${whoBtn(true)}</header>
      <div class="card">
        <div class="cal-h"><button class="icon-btn" data-act="cal-prev" aria-label="Прошлый месяц">${ic("left")}</button>
        <b>${MONTH[m - 1]} ${y}</b>
        <button class="icon-btn" data-act="cal-next" aria-label="Следующий месяц">${ic("right")}</button></div>
        <div class="wd"><span>пн</span><span>вт</span><span>ср</span><span>чт</span><span>пт</span><span>сб</span><span>вс</span></div>
        <div class="grid">${cells}</div>
        <div class="legend"><span><i></i>Верх</span><span><i class="low"></i>Низ</span><span><i class="o"></i>По плану</span><span><i class="t"></i>Сегодня</span></div>
      </div>
      ${calM !== t.slice(0, 7) ? `<div style="margin-top:12px"><button class="btn" data-act="cal-today">К сегодняшнему дню</button></div>` : ""}
      <p class="hint">Нажми на день: посмотреть, что делали, или перенести туда следующую тренировку.</p>`;
    h += `<h2 class="sec">${MONTH[m - 1]} <span class="muted">· ${monthDone.length} ${plural(monthDone.length, "тренировка", "тренировки", "тренировок")}</span></h2>`;
    h += monthDone.length
      ? `<div class="list">${monthDone
          .slice()
          .reverse()
          .map((s) => `<a class="row" href="#/w/${encodeURIComponent(s.id)}"><span class="dot${DAY.get(s.day).kind === "low" ? " low" : ""}"></span><span class="grow"><span class="t">${esc(DAY.get(s.day).name)}</span><span class="s" style="display:block">${cap(fdate(s.date))} · ${summaryLine(s)}</span></span><span class="chev"></span></a>`)
          .join("")}</div>`
      : `<div class="card muted small">В этом месяце ещё нет сделанных тренировок.</div>`;
    return h + `</div>` + tabs("cal");
  }

  // ---------- экран: план ----------
  function viewPlan() {
    const t = today();
    const wk = weekOf(t);
    let h = `<div class="page tabbed"><header class="head"><div><div class="eyebrow">Неделя ${wk} из ${PROGRAM.weeks}</div><h1>План</h1></div>${whoBtn(true)}</header>
      <div class="card"><ul class="rules">
        <li><b>Круг</b><span>${DAYS.map((d) => d.name).join(" → ")}, через день. Пропустили — следующая просто сдвигается.</span></li>
        <li><b>Отдых</b><span>База — 2–3 минуты, изоляция — 60–90 секунд.</span></li>
        <li><b>Кардио</b><span>${CARDIO_RULES.before} ${CARDIO_RULES.after}</span></li>
        <li><b>Срок</b><span>${PROGRAM.weeks} недель.</span></li>
      </ul></div>
      <details class="card"><summary>Как увеличивать нагрузку</summary><ul class="rules">${PROGRESS_RULES.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join("")}</ul></details>
      <details class="card"><summary>Кардио у каждого</summary><ul class="rules">${PRESET.map((p) => `<li><b>${esc((person(p.id) || p).name)}</b><span>${CARDIO_WHAT[p.id]}. После верха ${CARDIO_UP[p.id]} мин, после низа ${CARDIO_LOW[p.id]} мин.</span></li>`).join("")}
        <li><b>Ихтияр</b><span>${CARDIO_RULES.ihtiyar.join(" ")}</span></li><li><b>Отдых</b><span>${CARDIO_RULES.rest}</span></li></ul></details>`;
    DAYS.forEach((d, di) => {
      const isNext = !db.active && db.next.day === d.id;
      const foot = [];
      if (d.items.some((it) => it.from === 3)) foot.push("* Добавляем с 3-й недели.");
      if (d.items.some((it) => it.from === 5)) foot.push("** С 5-й недели, если восстановление хорошее.");
      h += `<section class="card day" style="margin-top:12px"><div class="day-h"><div><div class="eyebrow">День ${di + 1} из ${DAYS.length}</div><h3>${esc(d.name)}</h3></div>${
        isNext ? `<span class="pill next">${nextDate() === t ? "Сегодня" : "Следующая"}</span>` : `<span class="pill ${d.kind}">${d.kind === "up" ? "Верх" : "Низ"}</span>`
      }</div>
        <div class="muted small">${esc(d.muscles)}</div>
        <div class="list">${d.items
          .map((it, i) => {
            const p = prefAlt(d.id, i);
            const ex = alts(it).includes(p) ? p : alts(it)[0];
            const w = wOf(ex);
            const star = it.from === 3 ? "*" : it.from === 5 ? "**" : "";
            return `<button class="row exrow" data-act="info" data-ex="${ex}">${art(ex)}<div class="grow"><div class="t">${esc(itemName(it))}${star}</div>
              <div class="s"><span class="tag ${it.type}">${TAG[it.type]}</span>${w != null ? ` · <span class="wt">${fw(w)} кг</span>` : ""}</div></div><div class="r num">${it.sets} × ${reps(it)}</div></button>`;
          })
          .join("")}</div>
        ${foot.length ? `<p class="foot">${foot.join(" ")}</p>` : ""}
        <div class="cardio-line">${ic("pulse")}<span><b>Кардио после:</b> ${d.cardio[db.me] ? `${esc(meName())} — ${d.cardio[db.me]} мин` : `в среднем ${CARDIO_AVG[d.kind]} мин`}</span></div>
        ${d.notes.ihtiyar ? `<p class="foot"><b>Ихтияр:</b> ${esc(d.notes.ihtiyar)}</p>` : ""}
      </section>`;
    });
    return h + `</div>` + tabs("plan");
  }

  // ---------- экран: ещё ----------
  let installEvt = null;
  function viewMore() {
    const t = today();
    let h = `<div class="page tabbed"><header class="head"><div><div class="eyebrow">Настройки</div><h1>Ещё</h1></div></header>
      <h2 class="sec" style="margin-top:8px">Кто тренируется</h2>
      <div class="list">${db.people
        .map(
          (p) => `<div class="row"><button class="row" style="padding:0;min-height:0" data-act="pick" data-id="${esc(p.id)}"><span class="radio${p.id === db.me ? " on" : ""}"></span><span class="ava">${esc(initial(p.name))}</span><span class="grow t">${esc(p.name)}</span></button>
          <button class="link" data-act="rename" data-id="${esc(p.id)}">Изменить</button></div>`
        )
        .join("")}<button class="row" data-act="add-person" style="color:var(--accent);font-weight:600">${ic("plus").replace("<svg", '<svg style="width:22px;height:22px"')}Добавить человека</button></div>
      <p class="hint" style="text-align:left">У каждого свои веса и заметки. Друзьям лучше поставить приложение на свой телефон — тогда записи будут только их.</p>

      <h2 class="sec">Программа</h2>
      <div class="card"><div class="field"><label for="start-date"><b>Начало программы</b><div class="small muted">Сейчас неделя ${weekOf(t)} из ${PROGRAM.weeks}</div></label>
      <input id="start-date" type="date" value="${db.start}"></div></div>
      <p class="hint" style="text-align:left">От недели зависит, когда появятся упражнения «с 3-й недели» и «с 5-й».</p>

      <h2 class="sec">Таймер отдыха</h2>
      <div class="list"><button class="row" data-act="sound"><span class="grow"><span class="t">Звук в конце отдыха</span><span class="s" style="display:block">Таймер включается только когда сам нажмёшь ⏱</span></span><span class="sw${db.sound ? " on" : ""}" role="switch" aria-checked="${db.sound}"></span></button></div>

      <h2 class="sec">Телефон</h2>
      <div class="list">
        <button class="row" data-act="install">${ic("phone").replace("<svg", '<svg style="width:22px;height:22px;color:var(--accent)"')}<span class="grow t">Поставить на экран телефона</span><span class="chev"></span></button>
        <button class="row" data-act="share-app">${ic("share").replace("<svg", '<svg style="width:22px;height:22px;color:var(--accent)"')}<span class="grow t">Отправить ссылку друзьям</span><span class="chev"></span></button>
        <button class="row" data-act="backup">${ic("save").replace("<svg", '<svg style="width:22px;height:22px;color:var(--accent)"')}<span class="grow"><span class="t">Сохранить копию записей</span><span class="s" style="display:block">Файл — на случай смены телефона</span></span><span class="chev"></span></button>
        <button class="row" data-act="restore">${ic("restore").replace("<svg", '<svg style="width:22px;height:22px;color:var(--accent)"')}<span class="grow t">Восстановить из копии</span><span class="chev"></span></button>
      </div>
      <input id="restore-file" type="file" accept="application/json,.json" hidden>
      <p class="credits">Рисунки упражнений — <a href="https://github.com/everkinetic/data" target="_blank" rel="noopener">Everkinetic</a>, схема мышц — <a href="https://github.com/wger-project/wger" target="_blank" rel="noopener">wger</a> (CC BY-SA). Записи хранятся только на этом телефоне.</p>
    </div>`;
    return h + tabs("more");
  }

  // ---------- листы снизу ----------
  const sheetWrap = $("#sheet");
  const sheetEl = $(".sheet", sheetWrap);
  let sheetDirty = false;
  function openSheet(html) {
    sheetEl.innerHTML = html;
    sheetWrap.hidden = false;
    sheetEl.scrollTop = 0;
    sheetDirty = false;
  }
  function closeSheet() {
    if (sheetWrap.hidden) return;
    sheetWrap.hidden = true;
    sheetEl.innerHTML = "";
    if (sheetDirty) {
      sheetDirty = false;
      render();
    }
  }
  const shHead = (title) => `<div class="sh-h"><h2>${title}</h2><button class="done-btn" data-act="close">Готово</button></div>`;

  function sheetInfo(ex) {
    const E = EX[ex];
    const w = wOf(ex);
    const note = (db.notes[db.me] || {})[ex] || "";
    const hist = history(ex);
    const where = [];
    for (const d of DAYS) for (const it of d.items) if (alts(it).includes(ex)) where.push(`${d.name} — ${it.sets} × ${reps(it)}`);
    const pics =
      E.art === false
        ? `<div class="pics" style="grid-template-columns:1fr"><div class="mmwrap" style="justify-content:center"><div style="width:180px">${mmap(E.mm, E.ms)}</div></div></div>`
        : `<div class="pics"><div class="art anim"><img src="art/${ex}-0.svg" alt="Начало движения"><img class="b" src="art/${ex}-1.svg" alt="Конец движения"></div><div class="mmwrap">${mmap(E.mm, E.ms)}</div></div>`;
    let h = shHead(esc(E.name)) + pics + `<p class="muted" style="margin:10px 2px 0"><span style="color:#E5322D">●</span> ${esc(E.muscles)}</p>`;
    h += `<h3>Как делать</h3><ol class="how">${E.how.map((x) => `<li><span>${esc(x)}</span></li>`).join("")}</ol>`;
    if (E.tip) h += `<div class="tip">${ic("warn")}<span>${esc(E.tip)}</span></div>`;
    h += `<h3>Рабочий вес</h3><div class="stepper"><button data-act="ww" data-d="-2.5" aria-label="Минус 2,5 кг">−</button><label class="fld"><input class="ww" data-ex="${ex}" type="text" inputmode="decimal" autocomplete="off" value="${w == null ? "" : fw(w)}" placeholder="—" aria-label="Рабочий вес"><span>кг</span></label><button data-act="ww" data-d="2.5" aria-label="Плюс 2,5 кг">+</button></div>
      <p class="hint" style="text-align:left;margin-left:2px">Обновляется сам, когда отмечаешь подходы. Можно поправить вручную.</p>`;
    h += `<h3>Заметка</h3><textarea class="nt" data-ex="${ex}" rows="2" maxlength="300" placeholder="Например: сиденье на 4, узкий хват">${esc(note)}</textarea>`;
    h += `<h3>История</h3>`;
    if (hist.length) {
      h += chart(hist.slice(0, 12).reverse());
      h += `<div class="list hist">${hist
        .slice(0, 10)
        .map((x) => `<div class="row"><div class="grow"><div class="t">${cap(fdate(x.s.date))}</div><div class="s">${esc(DAY.get(x.s.day).name)} · <b class="num">${x.sets.map(fset).join(" · ")}</b></div></div></div>`)
        .join("")}</div>`;
    } else h += `<div class="card muted small">Пока нет записей. Отметь подходы на тренировке — они появятся здесь.</div>`;
    if (where.length) h += `<p class="hint" style="text-align:left;margin:14px 2px 0">В плане: ${where.join("; ")}.</p>`;
    openSheet(h);
  }
  function chart(pts) {
    const ws = pts.map((x) => Math.max.apply(null, x.sets.map((y) => (y.w == null ? 0 : y.w))));
    if (pts.length < 2 || ws.every((w) => w === 0)) return "";
    const W = 320;
    const H = 110;
    const lo = Math.min.apply(null, ws);
    const hi = Math.max.apply(null, ws);
    const span = hi - lo || 1;
    const X = (i) => 16 + (i * (W - 32)) / (ws.length - 1);
    const Y = (w) => 18 + (1 - (w - lo) / span) * (H - 44);
    const line = ws.map((w, i) => `${X(i).toFixed(1)},${Y(w).toFixed(1)}`).join(" ");
    return `<div class="card" style="padding:12px 10px 4px"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Вес по тренировкам: от ${fw(ws[0])} до ${fw(ws[ws.length - 1])} кг">
      <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".25"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <polygon class="ar" points="${X(0)},${H - 22} ${line} ${X(ws.length - 1)},${H - 22}"/>
      <polyline class="ln" points="${line}"/>
      ${ws.map((w, i) => `<circle class="pt" cx="${X(i).toFixed(1)}" cy="${Y(w).toFixed(1)}" r="4"/>`).join("")}
      <text x="${X(0)}" y="${H - 4}" text-anchor="start">${sdate(pts[0].s.date)} · ${fw(ws[0])} кг</text>
      <text x="${X(ws.length - 1)}" y="${H - 4}" text-anchor="end">${fw(ws[ws.length - 1])} кг</text>
    </svg></div>`;
  }
  function sheetMove() {
    const t = today();
    const nd = nextDate();
    const d = DAY.get(db.next.day);
    let chips = "";
    for (let k = 0; k < 8; k++) {
      const date = addDays(t, k);
      const dd = pd(date);
      chips += `<button class="${date === nd ? "on" : ""}" data-act="move-to" data-date="${date}"><b>${dd.getDate()}</b><small>${k === 0 ? "сегодня" : k === 1 ? "завтра" : WD[dd.getDay()]}</small></button>`;
    }
    openSheet(
      shHead("Перенести «" + esc(d.name) + "»") +
        `<p class="muted" style="margin:0 2px 14px">Сейчас она стоит на ${relFull(nd)}. Выбери новый день — все следующие тренировки сдвинутся вместе с ней, порядок круга не поменяется.</p>
      <div class="chips">${chips}</div>
      <div class="card field" style="margin-top:12px"><label for="move-date"><b>Другая дата</b></label><input id="move-date" type="date" min="${t}" value="${nd}"></div>`
    );
  }
  function moveTo(date) {
    if (!RE_DATE.test(date) || date < today()) return;
    db.next.date = date;
    save();
    closeSheet();
    render();
    const after = upcoming(2)[1];
    toast(`«${DAY.get(db.next.day).name}» — ${rel(date)}. Дальше «${DAY.get(after.day).name}» — ${rel(after.date)}`);
  }
  function sheetOther() {
    const t = today();
    openSheet(
      shHead("Другая тренировка") +
        `<p class="muted" style="margin:0 2px 14px">По плану «${esc(DAY.get(db.next.day).name)}». Если решили сделать другую — выбери, и круг дальше пойдёт от неё.</p>
      <div class="opts">${DAYS.map((d) => `<button class="btn${d.id === db.next.day ? " on" : ""}" data-act="set-day" data-day="${d.id}"><span>${esc(d.name)}</span><small>${esc(d.muscles)}</small></button>`).join("")}</div>`
    );
  }
  function sheetWho() {
    openSheet(
      shHead("Кто тренируется") +
        `<div class="list">${db.people.map((p) => `<button class="row" data-act="pick" data-id="${esc(p.id)}"><span class="radio${p.id === db.me ? " on" : ""}"></span><span class="ava">${esc(initial(p.name))}</span><span class="grow t">${esc(p.name)}</span></button>`).join("")}</div>
      <p class="hint" style="text-align:left">Добавить или переименовать — во вкладке «Ещё».</p>`
    );
  }
  function sessionSummary(s) {
    const day = DAY.get(s.day);
    const per = s.log[db.me] || {};
    const rows = [];
    DAY.get(s.day).items.forEach((it, i) => {
      const L = per[i];
      const sets = L ? L.sets.filter((x) => x.ok) : [];
      if (sets.length) rows.push(`<div class="row"><div class="grow"><div class="t">${esc(EX[L.ex].name)}</div><div class="s num">${sets.map(fset).join(" · ")}</div></div></div>`);
    });
    const c = s.cardio[db.me];
    if (c && c.ok) rows.push(`<div class="row"><div class="grow"><div class="t">Кардио</div><div class="s">${c.min} мин</div></div></div>`);
    return `<div class="card" style="margin-bottom:12px"><div class="day-h"><div><div class="eyebrow">${s.done ? "Сделано" : "Идёт сейчас"}</div><div class="ttl">${esc(day.name)}</div></div><span class="pill ${s.done ? "ok" : "next"}">${s.done ? "✓" : "…"}</span></div>
      ${rows.length ? `<div class="list sum" style="box-shadow:none;background:var(--surface-2);margin-top:12px">${rows.join("")}</div>` : `<p class="muted small">Записей у ${esc(meName())} нет.</p>`}
      <a class="btn" style="margin-top:12px" href="#/w/${encodeURIComponent(s.id)}">${s.done ? "Открыть и поправить" : "Продолжить"}</a></div>`;
  }
  function sheetDay(date) {
    const t = today();
    const ss = sessionsOn(date);
    const nd = nextDate();
    const u = date >= t ? upcomingUntil(date).find((x) => x.date === date) : null;
    let h = shHead(cap(fdate(date)));
    h += ss.map(sessionSummary).join("");
    if (u) {
      const d = DAY.get(u.day);
      h += `<div class="card" style="margin-bottom:12px"><div class="day-h"><div><div class="eyebrow">По плану</div><div class="ttl">${esc(d.name)}</div></div><span class="pill ${d.kind}">${d.kind === "up" ? "Верх" : "Низ"}</span></div>
        <p class="muted small" style="margin:6px 0 0">${esc(d.muscles)}</p>
        ${u.date === nd && date === t && !db.active ? `<button class="btn primary" style="margin-top:12px" data-act="start">Начать тренировку</button>` : ""}
        ${u.date === nd ? `<button class="btn" style="margin-top:8px" data-act="move">Перенести на другой день</button>` : ""}</div>`;
    }
    if (date >= t && date !== nd) {
      const d = DAY.get(db.next.day);
      h += `<button class="btn primary" data-act="move-to" data-date="${date}">Перенести «${esc(d.name)}» на этот день</button>
        <p class="hint">Сейчас «${esc(d.name)}» стоит на ${relFull(nd)}. Следующие тренировки сдвинутся вместе с ней.</p>`;
    }
    if (!ss.length && date < t) h += `<div class="card muted">В этот день тренировки не было.</div>`;
    openSheet(h);
  }
  function sheetWorkMenu() {
    const s = curS();
    if (!s) return;
    const isAct = db.active === s.id;
    openSheet(
      shHead(esc(DAY.get(s.day).name) + " · " + sdate(s.date)) +
        `<div class="opts">${
          isAct
            ? `<button class="btn" data-act="finish"><span>Закончить тренировку</span><small>следующая встанет через день</small></button>
               <button class="btn danger" data-act="cancel-w"><span>Отменить тренировку</span><small>записи удалятся, план вернётся</small></button>`
            : `<button class="btn danger" data-act="del-w"><span>Удалить эту запись</span><small>план не изменится</small></button>`
        }</div>`
    );
  }
  function sheetInstall() {
    const ios = isIOS();
    openSheet(
      shHead("Поставить на телефон") +
        (installEvt ? `<button class="btn primary big" data-act="install-now">Установить приложение</button><div style="height:14px"></div>` : "") +
        `<div class="card"><b>iPhone</b><ol class="steps"><li>Открой эту страницу в <b>Safari</b>.</li><li>Нажми «Поделиться» (квадрат со стрелкой).</li><li>Выбери «На экран „Домой“» → «Добавить».</li></ol></div>
      <div class="card"><b>Android (Redmi, Samsung…)</b><ol class="steps"><li>Открой страницу в <b>Chrome</b>.</li><li>Нажми ⋮ в правом верхнем углу.</li><li>«Установить приложение» или «Добавить на главный экран».</li></ol></div>
      <p class="hint">${ios ? "У тебя iPhone — смотри первый способ." : "Иконка «Зал» появится на экране, приложение будет работать и без интернета."}</p>`
    );
  }

  // ---------- таймер отдыха (только по нажатию) ----------
  const restEl = $("#rest");
  let rest = null;
  let restTick = 0;
  const mmss = (sec) => Math.floor(sec / 60) + ":" + pad(sec % 60);
  function restStart(sec) {
    unlockAudio();
    rest = { end: Date.now() + sec * 1000, total: sec, over: false, overAt: 0 };
    restEl.innerHTML = `<div class="rest-in"><div class="bar"></div><div class="lbl"><small>Отдых</small><b class="num">0:00</b></div>
      <button data-act="rest-add" data-d="-15" aria-label="Минус 15 секунд">−15</button><button data-act="rest-add" data-d="15" aria-label="Плюс 15 секунд">+15</button><button class="x" data-act="rest-stop" aria-label="Выключить таймер">${ic("x").replace("<svg", '<svg style="width:18px;height:18px"')}</button></div>
      <div class="rest-pick">${[60, 90, 120, 180].map((x) => `<button data-act="timer" data-sec="${x}">${mmss(x)}</button>`).join("")}</div>`;
    restEl.hidden = route().a !== "w";
    const pg = $(".page.work");
    if (pg) pg.classList.add("resting");
    clearInterval(restTick);
    restTick = setInterval(drawRest, 250);
    drawRest();
  }
  function restStop() {
    rest = null;
    clearInterval(restTick);
    restEl.hidden = true;
    restEl.classList.remove("over");
    const pg = $(".page.work");
    if (pg) pg.classList.remove("resting");
  }
  function drawRest() {
    if (!rest) return restStop();
    const left = Math.max(0, Math.ceil((rest.end - Date.now()) / 1000));
    if (left === 0 && !rest.over) {
      rest.over = true;
      rest.overAt = Date.now();
      beep();
    }
    if (rest.over && Date.now() - rest.overAt > 10000) return restStop();
    restEl.classList.toggle("over", rest.over);
    const b = $(".lbl b", restEl);
    const sm = $(".lbl small", restEl);
    const bar = $(".bar", restEl);
    if (b) b.textContent = rest.over ? "Подход!" : mmss(left);
    if (sm) sm.textContent = rest.over ? "Отдых закончился" : "Отдых";
    if (bar) bar.style.width = Math.min(100, (100 * (rest.total - left)) / rest.total) + "%";
  }
  let actx = null;
  function unlockAudio() {
    if (!db.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!actx && AC) actx = new AC();
      if (actx && actx.state === "suspended") actx.resume();
    } catch (e) {}
  }
  function beep() {
    try {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch (e) {}
    if (!db.sound || !actx) return;
    try {
      const t = actx.currentTime;
      [[0, 880], [0.22, 880], [0.44, 1320]].forEach(([k, f]) => {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + k);
        g.gain.exponentialRampToValueAtTime(0.35, t + k + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + k + 0.18);
        o.connect(g).connect(actx.destination);
        o.start(t + k);
        o.stop(t + k + 0.2);
      });
    } catch (e) {}
  }

  // Экран не гаснет, пока идёт тренировка (где браузер это умеет).
  let lock = null;
  async function keepAwake(on) {
    try {
      if (on && !lock && "wakeLock" in navigator && document.visibilityState === "visible") {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => (lock = null));
      } else if (!on && lock) {
        const l = lock;
        lock = null;
        await l.release();
      }
    } catch (e) {
      lock = null;
    }
  }

  // ---------- всплывашка ----------
  const toastEl = $("#toast");
  let toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("on"), 3200);
  }

  // ---------- отрисовка ----------
  let lastKey = "";
  let lastTab = "#/";
  function render() {
    settle();
    const r = route();
    if (r.a === "w" && !db.sessions[r.b]) {
      location.replace("#/");
      return;
    }
    if (r.a !== "w") lastTab = r.a === "home" ? "#/" : "#/" + r.a;
    const key = db.me ? r.a + "/" + r.b : "hello";
    let html;
    if (!db.me) html = viewHello();
    else if (r.a === "w") html = viewWork(db.sessions[r.b]);
    else if (r.a === "cal") html = viewCal();
    else if (r.a === "plan") html = viewPlan();
    else if (r.a === "more") html = viewMore();
    else html = viewHome();
    const y = window.scrollY;
    app.innerHTML = html;
    window.scrollTo(0, key === lastKey ? y : 0);
    lastKey = key;
    const working = !!db.me && r.a === "w";
    keepAwake(working && db.active === r.b);
    restEl.hidden = !(working && rest);
  }

  // ---------- действия ----------
  const ACT = {
    close: closeSheet,
    who: sheetWho,
    pick(t) {
      const id = t.dataset.id;
      if (!person(id)) return;
      const first = !db.me;
      db.me = id;
      save();
      closeSheet();
      render();
      if (!first) toast("Записи: " + meName());
    },
    "add-person"() {
      const n = (prompt("Имя") || "").trim().slice(0, 24);
      if (!n) return;
      const id = "p" + Date.now().toString(36);
      db.people.push({ id, name: n });
      db.me = id;
      save();
      render();
    },
    rename(t) {
      const p = person(t.dataset.id);
      if (!p) return;
      const n = (prompt("Новое имя", p.name) || "").trim().slice(0, 24);
      if (!n) return;
      p.name = n;
      save();
      render();
    },
    start() {
      const s = db.active ? db.sessions[db.active] : newSession(db.next.day, today());
      closeSheet();
      go("#/w/" + encodeURIComponent(s.id));
    },
    move: sheetMove,
    "move-to"(t) {
      moveTo(t.dataset.date);
    },
    other: sheetOther,
    "set-day"(t) {
      if (!DAY.has(t.dataset.day)) return;
      db.next.day = t.dataset.day;
      save();
      closeSheet();
      render();
      toast("Сегодня «" + DAY.get(db.next.day).name + "». Дальше круг пойдёт от неё");
    },
    info(t) {
      if (EX[t.dataset.ex]) sheetInfo(t.dataset.ex);
    },
    set(t) {
      const s = curS();
      if (!s) return;
      const sec = t.closest(".ex");
      const row = t.closest(".set");
      const i = +sec.dataset.i;
      const si = +row.dataset.s;
      const L = logOf(s, i, true);
      while (L.sets.length <= si) L.sets.push({});
      const st = L.sets[si];
      if (st.ok) st.ok = false;
      else {
        const r = int($(".r", row).value);
        if (r == null) {
          toast("Впиши, сколько раз сделал");
          $(".r", row).focus();
          return;
        }
        st.w = num($(".w", row).value);
        st.r = r;
        st.ok = true;
        bumpWork(s, i);
      }
      save();
      redrawCard(s, i);
    },
    addset(t) {
      const s = curS();
      if (!s) return;
      const i = +t.closest(".ex").dataset.i;
      const it = DAY.get(s.day).items[i];
      const L = logOf(s, i, true);
      while (L.sets.length < it.sets) L.sets.push({});
      L.sets.push({});
      save();
      redrawCard(s, i);
    },
    delset(t) {
      const s = curS();
      if (!s) return;
      const i = +t.closest(".ex").dataset.i;
      const L = logOf(s, i);
      if (L && L.sets.length > DAY.get(s.day).items[i].sets && !L.sets[L.sets.length - 1].ok) L.sets.pop();
      save();
      redrawCard(s, i);
    },
    alt(t) {
      const s = curS();
      if (!s || !EX[t.dataset.ex]) return;
      const i = +t.closest(".ex").dataset.i;
      const L = logOf(s, i, true);
      L.ex = t.dataset.ex;
      mine("alt")[s.day + ":" + i] = t.dataset.ex;
      save();
      redrawCard(s, i);
    },
    unlock(t) {
      const s = curS();
      if (!s) return;
      s.extra[+t.closest(".ex").dataset.i] = true;
      save();
      render();
    },
    cardio(t) {
      const s = curS();
      if (!s) return;
      const c = (s.cardio[db.me] = isObj(s.cardio[db.me]) ? s.cardio[db.me] : {});
      if (c.ok) c.ok = false;
      else {
        c.min = int($(".cm", t.closest(".set")).value) || cardioDefault(DAY.get(s.day));
        c.ok = true;
      }
      save();
      const el = document.getElementById("cardio");
      if (el) el.outerHTML = cardioCard(s);
    },
    timer(t) {
      restStart(+t.dataset.sec || 90);
    },
    "rest-add"(t) {
      if (!rest) return;
      const d = +t.dataset.d * 1000;
      if (rest.over) restStart(Math.max(15, +t.dataset.d));
      else {
        rest.end = Math.max(Date.now() + 1000, rest.end + d);
        rest.total = Math.max(rest.total, Math.ceil((rest.end - Date.now()) / 1000));
        drawRest();
      }
    },
    "rest-stop": restStop,
    finish() {
      const s = curS();
      if (!s || db.active !== s.id) return;
      if (!hasAny(s) && !confirm("Ни одного подхода не отмечено. Всё равно закончить?")) return;
      finishSession(s);
      restStop();
      closeSheet();
      go("#/");
      toast(`Готово! Следующая «${DAY.get(db.next.day).name}» — ${rel(nextDate())}`);
    },
    wmenu: sheetWorkMenu,
    "cancel-w"() {
      if (!confirm("Отменить тренировку? Записи этой тренировки удалятся, план вернётся как был.")) return;
      dropActive();
      restStop();
      closeSheet();
      go("#/");
    },
    "del-w"() {
      const s = curS();
      if (!s || !confirm("Удалить запись этой тренировки? Это нельзя отменить.")) return;
      delete db.sessions[s.id];
      save();
      closeSheet();
      go(lastTab);
    },
    "cal-prev"() {
      const [y, m] = calM.split("-").map(Number);
      calM = ds(new Date(y, m - 2, 1)).slice(0, 7);
      render();
    },
    "cal-next"() {
      const [y, m] = calM.split("-").map(Number);
      calM = ds(new Date(y, m, 1)).slice(0, 7);
      render();
    },
    "cal-today"() {
      calM = today().slice(0, 7);
      render();
    },
    day(t) {
      sheetDay(t.dataset.date);
    },
    ww(t) {
      const inp = $(".ww", sheetEl);
      const ex = inp.dataset.ex;
      const v = Math.max(0, (num(inp.value) || 0) + +t.dataset.d);
      inp.value = v ? fw(v) : "";
      setWork(ex, v || null);
    },
    sound() {
      db.sound = !db.sound;
      save();
      render();
    },
    install() {
      sheetInstall();
    },
    async "install-now"() {
      if (!installEvt) return;
      installEvt.prompt();
      try {
        await installEvt.userChoice;
      } catch (e) {}
      installEvt = null;
      closeSheet();
    },
    "hide-install"() {
      db.hideInstall = true;
      save();
      render();
    },
    async "share-app"() {
      const url = location.origin + location.pathname;
      try {
        if (navigator.share) {
          await navigator.share({ title: "Зал — тренировки", text: "Наш план тренировок: что делать сегодня, веса и техника", url });
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast("Ссылка скопирована");
      } catch (e) {
        prompt("Ссылка на приложение", url);
      }
    },
    async backup() {
      const name = "trenirovki-" + today() + ".json";
      const blob = new Blob([JSON.stringify(db)], { type: "application/json" });
      try {
        const file = new File([blob], name, { type: "application/json" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Копия записей" });
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1500);
    },
    restore() {
      $("#restore-file").click();
    },
  };
  function setWork(ex, v) {
    const w = mine("work");
    if (v == null) delete w[ex];
    else w[ex] = v;
    save();
    sheetDirty = true;
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const f = ACT[t.dataset.act];
    if (!f) return;
    e.preventDefault();
    f(t, e);
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches(".set .w, .set .r")) {
      const s = curS();
      const sec = t.closest(".ex");
      const row = t.closest(".set");
      if (!s || !sec || !row) return;
      const i = +sec.dataset.i;
      const si = +row.dataset.s;
      const L = logOf(s, i, true);
      while (L.sets.length <= si) L.sets.push({});
      const st = L.sets[si];
      if (t.classList.contains("w")) {
        st.w = num(t.value);
        // Поменял вес в подходе — в следующих неотмеченных, где вес ещё не трогали, он тоже меняется.
        sec.querySelectorAll(".set").forEach((r2) => {
          const j = +r2.dataset.s;
          if (j > si && !r2.classList.contains("ok") && !(L.sets[j] && L.sets[j].w !== undefined)) $(".w", r2).value = t.value;
        });
      } else st.r = int(t.value);
      if (st.ok) bumpWork(s, i);
      save();
    } else if (t.matches(".cm")) {
      const s = curS();
      if (!s) return;
      const c = (s.cardio[db.me] = isObj(s.cardio[db.me]) ? s.cardio[db.me] : {});
      c.min = int(t.value);
      save();
    } else if (t.matches(".ww")) {
      setWork(t.dataset.ex, num(t.value));
    } else if (t.matches(".nt")) {
      const n = mine("notes");
      const v = t.value.trim();
      if (v) n[t.dataset.ex] = v.slice(0, 300);
      else delete n[t.dataset.ex];
      save();
      sheetDirty = true;
    }
  });
  document.addEventListener("focusin", (e) => {
    const t = e.target;
    if (t.matches && t.matches(".fld input")) setTimeout(() => t.setSelectionRange && t.setSelectionRange(0, t.value.length), 0);
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "start-date" && RE_DATE.test(t.value)) {
      db.start = t.value;
      save();
      render();
      toast("Сейчас неделя " + weekOf(today()) + " из " + PROGRAM.weeks);
    } else if (t.id === "move-date" && t.value) moveTo(t.value);
    else if (t.id === "restore-file" && t.files && t.files[0]) {
      const fr = new FileReader();
      fr.onload = () => {
        let v = null;
        try {
          v = JSON.parse(fr.result);
        } catch (err) {}
        if (!isObj(v) || !isObj(v.sessions) || !Array.isArray(v.people)) return toast("Это не копия записей");
        const n = Object.keys(v.sessions).length;
        if (!confirm(`В копии ${n} ${plural(n, "тренировка", "тренировки", "тренировок")}. Заменить ими все записи на этом телефоне?`)) return;
        db = normalize(v);
        save();
        render();
        toast("Записи восстановлены");
      };
      fr.readAsText(t.files[0]);
      t.value = "";
    }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "new-person") return;
    e.preventDefault();
    const n = (e.target.n.value || "").trim().slice(0, 24);
    if (!n) return;
    const id = "p" + Date.now().toString(36);
    db.people.push({ id, name: n });
    db.me = id;
    save();
    render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });
  window.addEventListener("hashchange", () => {
    closeSheet();
    render();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const before = JSON.stringify([db.active, db.next]);
    settle();
    const r = route();
    if (r.a !== "w" || JSON.stringify([db.active, db.next]) !== before) render();
    else keepAwake(db.active === r.b);
  });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvt = e;
  });
  window.addEventListener("appinstalled", () => {
    db.hideInstall = true;
    save();
  });
  // Пришли со старого дня (телефон проспал ночь с открытым приложением) — обновить «сегодня».
  let day0 = today();
  setInterval(() => {
    if (today() !== day0) {
      day0 = today();
      if (sheetWrap.hidden && route().a !== "w") render();
    }
  }, 60000);

  render();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
