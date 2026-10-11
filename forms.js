// Navistad forms: keeps applications in the visitor's own browser (localStorage).
// There is no server, so everything lives on this device, in this browser only.
(function () {
  "use strict";

  const KEY = "ndfa.forms.v1";
  const DRAFT_DAYS = 14;                       // drafts are removed 14 days after creation
  const DAY = 24 * 60 * 60 * 1000;
  const TITLES = { naturalisation: "Application for Naturalisation" };
  const PAGES = { naturalisation: "naturalisation.html" };

  // Translator from lang.js. If that file is missing the forms still work, in English.
  const L = window.NDFA_LANG || {
    lang: "en",
    t: (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s),
    nodes: (s, v) => s.split(/(\{\w+\})/).filter(Boolean).map((p) => {
      const m = p.match(/^\{(\w+)\}$/);
      return m && v && m[1] in v ? v[m[1]] : p;
    }),
    date: (d) => new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }),
  };

  /* ---------- Storage ---------- */
  const store = {
    available() {
      try {
        localStorage.setItem(KEY + ".test", "1");
        localStorage.removeItem(KEY + ".test");
        return true;
      } catch (e) { return false; }
    },
    all() {
      try {
        const list = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(list) ? list : [];
      } catch (e) { return []; }
    },
    write(list) {
      try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
      catch (e) { return false; }
    },
    get(id) { return this.all().find((r) => r.id === id) || null; },
    put(rec) {
      const list = this.all();
      const i = list.findIndex((r) => r.id === rec.id);
      if (i >= 0) list[i] = rec; else list.push(rec);
      return this.write(list);
    },
    remove(id) { return this.write(this.all().filter((r) => r.id !== id)); },
    purgeExpired() {
      const now = Date.now();
      const list = this.all();
      const keep = list.filter((r) => r.status !== "draft" || now < expiresAt(r).getTime());
      if (keep.length !== list.length) this.write(keep);
    },
  };

  /* ---------- Helpers ---------- */
  const newId = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const newRef = () => "NAT-" + new Date().getFullYear() + "-" + (Math.floor(Math.random() * 900000) + 100000);
  const expiresAt = (rec) => new Date(new Date(rec.created).getTime() + DRAFT_DAYS * DAY);
  const daysLeft = (rec) => Math.max(0, Math.ceil((expiresAt(rec) - Date.now()) / DAY));
  const fmtTime = (d) => new Date(d).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" });
  const applicant = (rec) => {
    const d = rec.data || {};
    return [d.givenNames, d.surname].filter(Boolean).join(" ") || L.t("Not entered yet");
  };

  // Small DOM builder. Text always goes in as text, never as HTML.
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    kids.flat().forEach((c) => { if (c != null) n.append(c); });
    return n;
  }

  /* ---------- The application form ---------- */
  function initForm(form) {
    const banner = document.getElementById("form-banner");
    const status = document.getElementById("form-status");
    const actions = document.getElementById("form-actions");
    const myFormsLink = () => el("a", { href: "my-forms.html", text: L.t("My Forms") });

    // The banner and status line are rebuilt from these whenever the language changes
    let renderBanner = () => {};
    let renderStatus = () => {};
    document.addEventListener("ndfa:langchange", () => { renderBanner(); renderStatus(); });

    form.addEventListener("submit", (e) => e.preventDefault());

    // Browser pop-up messages for missing fields, in Latin when Latin is chosen
    const validityMessage = (f) => {
      if (L.lang !== "la") return "";
      const v = f.validity;
      if (v.valueMissing) {
        return L.t(f.type === "checkbox" ? "Please tick this box to continue."
          : f.tagName === "SELECT" ? "Please select an option." : "Please fill out this field.");
      }
      if (v.typeMismatch) return L.t("Please enter a valid email address.");
      if (v.rangeOverflow) return L.t("The date cannot be in the future.");
      if (v.badInput) return L.t("Please enter a valid date.");
      return "";
    };
    form.addEventListener("invalid", (e) => { e.target.setCustomValidity(validityMessage(e.target)); }, true);
    ["input", "change"].forEach((ev) => {
      form.addEventListener(ev, (e) => { if (e.target.setCustomValidity) e.target.setCustomValidity(""); }, true);
    });

    if (!store.available()) {
      form.hidden = true;
      actions.hidden = true;
      renderBanner = () => banner.replaceChildren(
        L.t("Your browser is blocking site storage, so applications cannot be saved on this page. Allow site data and reload."));
      renderBanner();
      return;
    }

    store.purgeExpired();

    const params = new URLSearchParams(location.search);
    const id = params.get("draft") || params.get("view");
    let rec = id ? store.get(id) : null;

    if (id && !rec) {
      form.hidden = true;
      actions.hidden = true;
      renderBanner = () => banner.replaceChildren(...L.nodes(
        "We could not find that application. Drafts are removed {days} days after they are created. Go to {myforms}.",
        { days: DRAFT_DAYS, myforms: myFormsLink() }));
      renderBanner();
      return;
    }

    const fill = (data) => {
      Array.from(form.elements).forEach((c) => {
        if (!c.name || !(c.name in data)) return;
        if (c.type === "checkbox") c.checked = !!data[c.name]; else c.value = data[c.name];
      });
    };
    const collect = () => {
      const out = {};
      Array.from(form.elements).forEach((c) => {
        if (c.name) out[c.name] = c.type === "checkbox" ? c.checked : c.value.trim();
      });
      return out;
    };

    // People cannot have been born, or arrived, in the future
    const today = new Date().toISOString().slice(0, 10);
    form.querySelectorAll('input[type="date"]').forEach((i) => { i.max = today; });

    if (rec) fill(rec.data || {});

    // Submitted applications open read-only
    if (rec && rec.status === "submitted") {
      Array.from(form.elements).forEach((c) => { c.disabled = true; });
      actions.hidden = true;
      status.hidden = true;
      renderBanner = () => banner.replaceChildren(...L.nodes(
        "Submitted on {date}. Reference: {ref}. This application can no longer be changed. Back to {myforms}.",
        { date: L.date(rec.submitted), ref: el("strong", { text: rec.ref }), myforms: myFormsLink() }));
      renderBanner();
      return;
    }

    const describeDraft = () => banner.replaceChildren(...L.nodes(
      "This is a draft. It was created on {created} and will be removed on {expires} if it is not submitted. You can find it under Drafts in {myforms}.",
      { created: L.date(rec.created), expires: L.date(expiresAt(rec)), myforms: myFormsLink() }));
    const describeNew = () => banner.replaceChildren(...L.nodes(
      "Fill in what you can and press Save as draft. You can finish later from {myforms}. Drafts are kept for {days} days.",
      { myforms: myFormsLink(), days: DRAFT_DAYS }));

    renderBanner = rec ? describeDraft : describeNew;
    renderBanner();

    // build() returns the pieces of the message; it runs again if the language changes
    const say = (build, isError) => {
      renderStatus = () => {
        status.className = "form-status" + (isError ? " error" : "");
        status.replaceChildren(...build());
      };
      renderStatus();
    };

    // Creates the draft the first time, updates it after that
    const persist = () => {
      const now = new Date().toISOString();
      if (!rec) {
        rec = { id: newId(), type: "naturalisation", title: TITLES.naturalisation, status: "draft", created: now };
      }
      rec.updated = now;
      rec.data = collect();
      return store.put(rec);
    };

    document.getElementById("btn-save").addEventListener("click", () => {
      if (!persist()) { say(() => [L.t("Sorry, the draft could not be saved in this browser.")], true); return; }
      history.replaceState(null, "", "?draft=" + encodeURIComponent(rec.id));
      renderBanner = describeDraft;
      renderBanner();
      const savedAt = fmtTime(rec.updated);
      say(() => L.nodes("Draft saved at {time}. Open {myforms} to find it under Drafts.",
        { time: savedAt, myforms: myFormsLink() }), false);
    });

    document.getElementById("btn-submit").addEventListener("click", () => {
      if (!form.reportValidity()) {
        say(() => [L.t("Please complete the highlighted fields before submitting.")], true);
        return;
      }
      if (!window.confirm(L.t("Submit your application? You will not be able to change it afterwards."))) return;
      const failed = () => say(() => [L.t("Sorry, the application could not be saved in this browser.")], true);
      if (!persist()) { failed(); return; }
      rec.status = "submitted";
      rec.submitted = new Date().toISOString();
      rec.ref = newRef();
      if (!store.put(rec)) { failed(); return; }
      location.href = "my-forms.html?tab=submitted";
    });
  }

  /* ---------- My Forms ---------- */
  function initMyForms() {
    const draftsBody = document.getElementById("drafts-body");
    const submittedBody = document.getElementById("submitted-body");
    const tabs = Array.from(document.querySelectorAll(".tab"));
    const panels = Array.from(document.querySelectorAll(".tab-content"));

    const showTab = (name) => {
      tabs.forEach((t) => t.classList.toggle("active", t.dataset.target === name));
      panels.forEach((p) => p.classList.toggle("active", p.id === name));
    };

    const emptyRow = (cols, message) =>
      el("tr", {}, el("td", { class: "empty", colspan: String(cols) },
        L.t(message), " ", el("a", { href: "../index.html", text: L.t("Start from the Home page") }), "."));

    function render() {
      const ok = store.available();
      if (ok) store.purgeExpired();
      const list = ok ? store.all() : [];
      const drafts = list.filter((r) => r.status === "draft").sort((a, b) => new Date(b.updated) - new Date(a.updated));
      const subs = list.filter((r) => r.status === "submitted").sort((a, b) => new Date(b.submitted) - new Date(a.submitted));

      tabs.forEach((t) => {
        if (t.dataset.target === "drafts") t.textContent = L.t("Drafts") + " (" + drafts.length + ")";
        if (t.dataset.target === "submitted") t.textContent = L.t("Submitted", null, "tab") + " (" + subs.length + ")";
      });

      draftsBody.replaceChildren();
      if (!ok) {
        draftsBody.append(el("tr", {}, el("td", {
          class: "empty", colspan: "6",
          text: L.t("Your browser is blocking site storage, so saved forms cannot be shown."),
        })));
      } else if (!drafts.length) {
        draftsBody.append(emptyRow(6, "You have no drafts."));
      }
      drafts.forEach((r) => {
        const left = daysLeft(r);
        draftsBody.append(el("tr", {},
          el("td", { text: L.t(r.title) }),
          el("td", { text: applicant(r) }),
          el("td", { text: L.date(r.created) }),
          el("td", {}, el("span", { class: "badge draft", text: L.t("Draft") })),
          el("td", {
            class: "expires" + (left <= 3 ? " warn" : ""),
            text: left === 1 ? L.t("1 day left") : L.t("{n} days left", { n: left }),
          }),
          el("td", { class: "actions" },
            el("a", { class: "row-btn", href: (PAGES[r.type] || "naturalisation.html") + "?draft=" + encodeURIComponent(r.id), text: L.t("Continue") }),
            el("button", {
              class: "row-btn danger", type: "button", text: L.t("Delete"),
              onclick: () => {
                if (window.confirm(L.t("Delete this draft? This cannot be undone."))) { store.remove(r.id); render(); }
              },
            }))
        ));
      });

      submittedBody.replaceChildren();
      if (!subs.length) submittedBody.append(emptyRow(6, "You have not submitted any applications yet."));
      subs.forEach((r) => {
        submittedBody.append(el("tr", {},
          el("td", { text: L.t(r.title) }),
          el("td", { text: applicant(r) }),
          el("td", { text: L.date(r.submitted) }),
          el("td", { text: r.ref }),
          el("td", {}, el("span", { class: "badge submitted", text: L.t("Submitted") })),
          el("td", { class: "actions" },
            el("a", { class: "row-btn", href: (PAGES[r.type] || "naturalisation.html") + "?view=" + encodeURIComponent(r.id), text: L.t("View") }))
        ));
      });
    }

    render();
    showTab(new URLSearchParams(location.search).get("tab") === "submitted" ? "submitted" : "drafts");

    // Redraw in the new language, and keep the lists current if the forms change in another tab
    document.addEventListener("ndfa:langchange", render);
    window.addEventListener("storage", (e) => { if (e.key === KEY) render(); });
  }

  /* ---------- Start ---------- */
  const form = document.getElementById("app-form");
  if (form) initForm(form);
  if (document.getElementById("drafts-body")) initMyForms();
})();
