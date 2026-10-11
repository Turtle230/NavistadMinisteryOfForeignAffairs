// Navistadi passport flipbook.
// Every PDF page is a two-page spread. A "leaf" is one sheet of paper:
// its front is the right half of spread n, its back is the left half of spread n+1.
(function () {
  const book = document.getElementById("book");
  if (!book) return;

  // Translator from lang.js. If that file is missing the viewer still works, in English.
  const L = window.NDFA_LANG || {
    t: (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s),
  };

  const TOTAL = 13;                 // spreads in the PDF
  const LEAVES = TOTAL - 1;         // sheets that can be turned
  const DIR = "../assets/passport/";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TURN_MS = reduceMotion ? 20 : 1600;  // keep in sync with --turn in passport.css
  const STAGGER_MS = 220;                    // delay between pages when flipping several at once

  const label = document.getElementById("pp-label");
  const prevBtn = document.getElementById("pp-prev");
  const nextBtn = document.getElementById("pp-next");
  const coverBtn = document.getElementById("pp-cover");
  const soundBtn = document.getElementById("pp-sound");

  const pad = (n) => String(n).padStart(2, "0");
  const img = (n, side) => `<img src="${DIR}s${pad(n)}-${side}.jpg" alt="" draggable="false">`;

  // Bottom of the right-hand stack: the final right-hand page
  book.insertAdjacentHTML("beforeend", `<div class="page-base">${img(TOTAL, "r")}</div>`);

  const leaves = [];
  for (let i = 1; i <= LEAVES; i++) {
    const el = document.createElement("div");
    el.className = "leaf";
    el.innerHTML =
      `<div class="face front">${img(i, "r")}</div>` +
      `<div class="face back">${img(i + 1, "l")}</div>`;
    el.style.zIndex = String(LEAVES - i + 1);   // leaf 1 (the cover) sits on top
    book.appendChild(el);
    leaves.push(el);
  }

  const names = ["Front cover", "Inside cover and title page", "Personal data page"];
  let p = 0;          // how many leaves have been turned
  let run = 0;        // id of the current multi-page turn, so a newer one cancels an older one

  /* ---------- Sound (a soft synthesised paper swish) ---------- */
  let audio = null;
  let soundOn = true;
  function swish() {
    if (!soundOn || reduceMotion) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const dur = 1.0;
      const rate = audio.sampleRate;
      const buf = audio.createBuffer(1, Math.floor(rate * dur), rate);
      const data = buf.getChannelData(0);
      for (let k = 0; k < data.length; k++) {
        const t = k / data.length;
        data[k] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) * (1 - t * 0.5);
      }
      const src = audio.createBufferSource();
      src.buffer = buf;
      const filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(900, audio.currentTime);
      filter.frequency.exponentialRampToValueAtTime(3400, audio.currentTime + dur);
      const gain = audio.createGain();
      gain.gain.value = 0.14;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.destination);
      src.start();
    } catch (e) { /* sound is optional */ }
  }

  /* ---------- Turning ---------- */
  function turn(i, forward) {            // i is the 1-based leaf number
    const el = leaves[i - 1];
    clearTimeout(el._timer);
    // Lift the moving leaf above everything while it travels
    el.style.zIndex = String(forward ? 50 + i : 50 + (LEAVES - i));
    el.classList.remove("turning");
    void el.offsetWidth;                 // restart the shading animation
    el.classList.add("turning");
    el.classList.toggle("flipped", forward);
    swish();
    el._timer = setTimeout(() => {
      el.classList.remove("turning");
      // Flipped leaves stack upwards on the left, unflipped ones downwards on the right
      el.style.zIndex = String(forward ? i : LEAVES - i + 1);
    }, TURN_MS + 40);
  }

  function refresh() {
    book.dataset.state = p === 0 ? "cover" : "open";
    leaves.forEach((el) => el.classList.remove("next", "prev"));
    if (p < LEAVES) leaves[p].classList.add("next");
    if (p > 0) leaves[p - 1].classList.add("prev");
    prevBtn.disabled = p === 0;
    nextBtn.disabled = p === LEAVES;
    coverBtn.hidden = p === 0;
    const name = L.t(names[p] || (p === LEAVES ? "Last page" : "Visa pages"));
    label.textContent = L.t("{name} · {n} of {total}", { name, n: p + 1, total: TOTAL });
  }

  function goTo(target) {
    target = Math.max(0, Math.min(LEAVES, target));
    const myRun = ++run;
    (function step() {
      if (myRun !== run || p === target) return;
      if (p < target) { p++; turn(p, true); }
      else { turn(p, false); p--; }
      refresh();
      if (p !== target) setTimeout(step, STAGGER_MS);
    })();
  }

  const next = () => goTo(p + 1);
  const prev = () => goTo(p - 1);

  /* ---------- Input ---------- */
  let swiped = false;
  let startX = null;

  book.addEventListener("pointerdown", (e) => { startX = e.clientX; swiped = false; });
  book.addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 45) {             // a swipe
      swiped = true;
      dx < 0 ? next() : prev();
    }
  });
  book.addEventListener("pointercancel", () => { startX = null; });

  book.addEventListener("click", (e) => {
    if (swiped) { swiped = false; return; }
    const rect = book.getBoundingClientRect();
    (e.clientX - rect.left > rect.width / 2) ? next() : prev();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); goTo(0); }
    else if (e.key === "End") { e.preventDefault(); goTo(LEAVES); }
  });

  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);
  coverBtn.addEventListener("click", () => goTo(0));
  const renderSound = () => {
    soundBtn.textContent = L.t(soundOn ? "Sound: on" : "Sound: off");
    soundBtn.setAttribute("aria-pressed", String(soundOn));
  };
  soundBtn.addEventListener("click", () => { soundOn = !soundOn; renderSound(); });

  // Redraw the label and sound button when the language is switched in the footer
  document.addEventListener("ndfa:langchange", () => { refresh(); renderSound(); });

  // If the visitor's system asks for reduced motion, pages turn instantly. Say so.
  const motionNote = document.getElementById("pp-motion-note");
  if (reduceMotion && motionNote) motionNote.hidden = false;

  refresh();
  renderSound();
})();
