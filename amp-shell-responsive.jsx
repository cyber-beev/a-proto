/**
 * AMP Global — responsive entry.
 *
 * The desktop and mobile shells are whole, independent shells: same pager,
 * matrix, gradients and intro, different layout, nav and type scale. Each is
 * kept in its own closure below (its top-level constants are private to it),
 * and this file mounts exactly one of them for the current viewport, swapping
 * on the 768px breakpoint. Crossing the breakpoint remounts — the new shell
 * skips the load intro, which only plays on first load.
 *
 * Edit the layouts in amp-shell.jsx / amp-shell-mobile.jsx; this file is
 * generated from them.
 */

const DesktopShell = (function () {
const { useEffect, useRef, useState, useCallback, useMemo } = React;

/**
 * AMP Global — Merged Shell (Specs 1 + 2 + 3)
 *
 * First accretion merge. Three settled behaviours combined into one prototype
 * with the real AMP homepage content, ahead of layering Spec 4 (gradient) and
 * the eventual Claude Design handoff.
 *
 *   Spec 1  Section paging    — hijacked pager, one section per gesture.
 *   Spec 2  Responsive layout — fluid clamp sizing inside each section.
 *   Spec 3  Matrix overlay    — ambient dot grid + cursor field, FIXED behind
 *                               the pager (does not translate with sections).
 *
 * Integration decisions this merge resolves (the things isolation hid):
 *   - Matrix sits behind the paged container (z-index) and is position:fixed, so
 *     it stays put while sections slide over it. pointer-events:none so it never
 *     steals input from the pager; the cursor field reads window mouse coords.
 *   - Both the pager and the matrix take height from the same 100dvh source, so
 *     they agree on iOS with the dynamic toolbar.
 *   - One prefers-reduced-motion read drives BOTH: pager transition shortens
 *     (stays physical, per the Spec 1 decision) AND the matrix sweep is
 *     suppressed while the static grid + cursor field remain.
 *   - Clamp sizing runs inside translated, inert-toggled sections and still
 *     honours the must-fit contract.
 *
 * Dev tuning panel is behind a toggle (the small ⚙ button), OFF by default, so
 * the shell reads as a clean prototype. Locked Spec 3 values are the defaults.
 */

const PAPER = "#FAF8F5";
const INK = "#17130F";
const ACCENT = "#F9603D";
const RULE = "#DDD6CC";
const INK_SOFT = "#3A332C";

// Locked Spec 3 values (from the isolated harness).
const MATRIX = {
  cell: 5,
  dot: 0.5,
  baseOpacity: 0.1,
  cursorRadius: 40,
  cursorStrength: 0.2,
  cursorFalloff: 2.7,
  dotGrow: 2.3,
  flashInterval: 2.5,
  sweepDuration: 2.6,
  bandWidth: 300,
  flashOpacity: 0.45,
  flashBoostUnderCursor: 1.1,
  // The sweep IS the AMP mark: the travelling band only lights the dots that
  // fall inside the logo, so the wordmark writes itself across the grid.
  logoWidth: 0.74,     // mark width as a fraction of the viewport
  logoOpacity: 0.62,   // added opacity for a dot fully inside the mark
  logoResidual: 0.3,   // how much of flashOpacity the off-mark band keeps
  logoGrow: 2.0,       // dot growth inside the mark
  // Layout plan §4: on the Focus section the matrix ALSO shows the map of the
  // current region, and the projection changes as the region buttons cycle.
  regionWidth: 0.42,   // map width as a fraction of the viewport
  regionGap: 60,       // px between the copy and the top of the map
  regionOpacity: 0.44,
  regionGrow: 2.6,
  regionFade: 420,     // ms cross-fade between projections
};

// Locked Spec 1 values.
const PAGING = {
  duration: 800, // ms, section transition — plays in full
  easePower: 3.2,
  breakAfter: 0, // no artificial break: the animation itself is the only gate.
  // fullPage.js works this way (canScroll re-enables exactly when the transition
  // ends) and relies on acceleration detection alone to reject the momentum
  // tail. An added break was only ever compensating for an over-long synthetic
  // momentum model; real trackpad tails run 0.5-2s and are rejected on merit.
  touchDist: 60, // px, touch commit distance
  touchVel: 0.45, // px/ms, touch commit (fling) velocity
  rubberband: 0.5, // end-overscroll resistance
  reducedDuration: 260, // ms cap under prefers-reduced-motion
};

// Spec 4 — section gradient. Settled values from the isolated harness.
// Section content cross-fade during a paging transition. The sections already
// slide as a block; this fades the CONTENT of the outgoing section out and the
// incoming one in on top of that, so a transition reads as a change of subject
// rather than a rigid panel slide.
const CONTENT_FADE = {
  enabled: true,
  sharpness: 1.9, // higher = content disappears sooner into the move
  lift: 26, // px of counter-drift; 0 = pure fade
  floor: 0, // opacity never drops below this (0 = fades fully out)
};

// The footer is NOT a full-height section. Reaching it shifts the preceding
// section up by just the footer's height, so that section stays mostly on
// screen while the footer is revealed beneath it. That makes the last stop a
// PARTIAL move, which is why the pager needs a per-stop offset rather than a
// uniform index * viewportHeight.
const FOOTER = {
  // The footer is sized by its CONTENT, not by a fixed fraction of the
  // viewport: it is measured after layout and that height is what the pager
  // lifts the preceding section by. padY controls how snug it feels.
  padY: 34, // px, vertical breathing room above/below the content
  minVh: 18, // floor, so a very short footer still reads as a panel
  maxVh: 55, // ceiling, so it can never swallow the section above it
  // When the footer is revealed, the section above it is still mostly on
  // screen. Frosting that leftover body demotes it so the footer reads as the
  // focus rather than as a strip under a still-dominant section.
  frostBlur: 4,
  frostTint: 0.22,
};

const GRADIENT = {
  standard: { colorMode: "ground", spreadX: 60, height: 20, opacity: 0.16, midStop: 30, feather: 100 },
  footer: { colorMode: "accent", spreadX: 75, height: 32, opacity: 0.38, midStop: 29, feather: 100 },
  fade: { enabled: true, sharpness: 2.2, drift: 64 },
};

// Wheel gesture detection by acceleration.
//
// Per-event delta comparison cannot separate a user's scroll from a trackpad's
// momentum tail: browsers deliver INTEGER-quantized deltas, so a decaying tail
// produces flat plateaus (24,24,23,23,22,22…) that read as "not decaying" and
// punch through any per-event threshold.
//
// Comparing two rolling averages fixes this. Momentum decays, so its recent
// average falls below its longer-run average; a user actively driving the wheel
// keeps the recent average at or above it. Averaging smooths the quantization
// that defeats per-event tests. (Approach learned from fullPage.js, which is
// GPL-3.0 — this is an independent implementation of the idea, not its code.)
const WHEEL = {
  sampleCap: 150, // max retained samples
  winRecent: 10, // short window — "right now"
  winLong: 70, // long window — "this gesture so far"
  gestureReset: 200, // ms of quiet that starts a fresh sample window
};

// Average of the last `size` samples, divided by the WINDOW size rather than the
// sample count. Early in a gesture the long window is therefore diluted, so the
// recent window clears it easily and the first movement registers immediately.
function windowAvg(samples, size) {
  const from = Math.max(samples.length - size, 0);
  let sum = 0;
  for (let i = from; i < samples.length; i++) sum += samples[i];
  return sum / size;
}

function isAccelerating(samples) {
  return (
    windowAvg(samples, WHEEL.winRecent) >= windowAvg(samples, WHEEL.winLong)
  );
}

// Spec 5 — nav interactions. Settled in the isolated harness.
const EASINGS = {
  "out-quint": "cubic-bezier(0.22, 1, 0.36, 1)",
  "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
  "in-out-quart": "cubic-bezier(0.76, 0, 0.24, 1)",
  "out-back": "cubic-bezier(0.34, 1.4, 0.64, 1)",
};

const NAVCFG = {
  // fold out (item 1) — rightmost leads
  travel: 1180, stagger: 70, ease: "out-quint", fadeStart: 0, distance: 40,
  barTravel: 420, barStagger: 95, barEase: "out-expo",
  // menu opens (item 2) — opposite direction, order reversed
  openTravel: 720, openStagger: 70, openEase: "out-expo", reverseOrder: true,
  morph: 380, morphEase: "in-out-quart",
  // hover (item 3)
  hoverScale: 1.12, hoverMs: 220, hoverEase: "out-back",
  // frost (item 4)
  blur: 5, frost: 0.18, frostMs: 420, frostEase: "out-quint", contentScale: 0.985,
  // active pulse (item 5)
  pulseOn: true, pulsePeriod: 2600, pulseMax: 140, pulseWidth: 40,
  pulseStrength: 0.28, pulseFalloff: 3.0, pulseGrow: 1.5,
  pulseShape: "frame", pulsePadX: 14, pulsePadY: 10, pulseCorner: 10,
};

// Real AMP site structure: five pages, each with its own sections.
// Section counts deliberately differ per page — routing has to cope with that,
// and "nav visible on the first section of each page" only means something once
// pages actually exist.
const PAGES = [
  {
    id: "home",
    label: "Home",
    sections: [
      { id: "hero", kind: "hero" },
      { id: "approach", kind: "approach" },
      { id: "focus", kind: "focus" },
    ],
  },
  {
    id: "about",
    label: "About",
    sections: [
      { id: "what-we-do", kind: "whatWeDo" },
      { id: "edge", kind: "edge" },
      { id: "who", kind: "who" },
    ],
  },
  {
    id: "team",
    label: "Team",
    sections: [{ id: "team", kind: "team" }],
  },
  {
    id: "contact",
    label: "Contact",
    sections: [
      { id: "contact-statement", kind: "contact" },
      { id: "contact-form", kind: "proposal" },
    ],
  },
];

// Load intro: the mark is wiped in left to right, holds, then flies into the
// nav slot. The wipe is a clip-path inset animation on the img itself — one
// compositable property, no mask image and no second element to keep in sync.
// The flight is a measured FLIP onto the real nav logo, so the handover lands
// on the same pixels and reads as one continuous object.
const INTRO = {
  wipe: 900, hold: 1000, fly: 1100, size: "min(62vw, 560px)",
  // Opaque through the mask's left half, then the soft ramp, then clear. The
  // 50% stop matters: at the final mask position the element shows exactly that
  // left half, so anything less leaves the mark's right edge half-faded.
  mask: "linear-gradient(90deg, #000 0%, #000 50%, rgba(0,0,0,0.4) 57%, rgba(0,0,0,0) 66%, rgba(0,0,0,0) 100%)",
};

const LOGO_DARK = "assets/amp-logo-black.png";
const LOGO_LIGHT = "assets/amp-logo-white.png";

const PILLARS = [
  ["Invest", "We deploy capital into music rights and platforms with long-term growth potential."],
  ["Build", "We actively support development, optimisation, and scale, not passive ownership."],
  ["Partner", "We collaborate with creators, rights holders, and local partners to align incentives and unlock value."],
];

const EDGES = [
  ["Local Access", "On-the-ground insight and trusted regional relationships.", "pin"],
  ["Disciplined Capital", "Institutional approach to valuation, risk, and long-term returns.", "scale"],
  ["Build, Not Just Buy", "Active ownership focused on development and scale.", "build"],
  ["Data-Informed Strategy", "Using analytics and technology to support smarter decisions and monetisation.", "data"],
];

/* Our Edge marks. Same 34-unit grid and 1.6 stroke as the Who icons, so the
   two sets read as one family. */
function EdgeIcon({ shape }) {
  const common = {
    width: 22, height: 22, viewBox: "0 0 34 34", fill: "none",
    stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round",
    "aria-hidden": true,
  };
  if (shape === "pin")
    return (
      <svg {...common}>
        <path d="M17 31c6.5-8 9.5-12.6 9.5-17a9.5 9.5 0 0 0-19 0c0 4.4 3 9 9.5 17z" />
        <circle cx="17" cy="13.5" r="3.2" />
      </svg>
    );
  if (shape === "scale")
    return (
      <svg {...common}>
        <path d="M17 5v24M7 29h20" />
        <path d="M4 12h26M4 12l-2.5 6.5h5zM30 12l2.5 6.5h-5z" />
      </svg>
    );
  if (shape === "build")
    return (
      <svg {...common}>
        <rect x="4" y="21" width="8" height="9" />
        <rect x="13" y="14" width="8" height="16" />
        <rect x="22" y="7" width="8" height="23" />
      </svg>
    );
  if (shape === "data")
    return (
      <svg {...common}>
        <path d="M5 5v24h24" />
        <path d="M10 23l6.5-7.5 5 4L29 10" />
      </svg>
    );
  return null;
}

const FOUNDERS = [
  ["Alfonso Perez Soto", "CEO & Founder", "assets/alfonso.png"],
  ["Temi Adeniji", "COO & Founder", "assets/temi.png"],
  ["Inigo Zabala", "AMP Global Partner", "assets/inigo.png"],
];


function AmpShell({ skipIntro }) {
  // ── shared height source (Spec 1 + Spec 3 agree via one dvh probe) ──────
  const viewportRef = useRef(null);

  // ── reduced motion, one read drives pager + matrix ──────────────────────
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // ── dev panel ───────────────────────────────────────────────────────────
  const [devOpen, setDevOpen] = useState(false);
  const [matrix, setMatrix] = useState(MATRIX);
  // Lifted out of the Focus section: the background matrix needs it too.
  const [region, setRegion] = useState(0);
  // Bottom of the focus copy, in viewport px — the map is placed under it.
  const [focusBottom, setFocusBottom] = useState(0);

  const [grad, setGrad] = useState(GRADIENT);
  // Dark is the default, but a device that explicitly asks for light gets it.
  // "no-preference" does not match either query, so it falls through to dark.
  const [dark, setDark] = useState(() =>
    typeof window === "undefined"
      ? true
      : !window.matchMedia("(prefers-color-scheme: light)").matches
  );
  // Once the visitor uses the toggle, their choice outranks the device for the
  // rest of the session — a later OS switch should not yank it back.
  const darkPinned = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => { if (!darkPinned.current) setDark(!mq.matches); };
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const [pageIndex, setPageIndex] = useState(0);
  const [intro, setIntro] = useState(!skipIntro);
  const introDone = useCallback(() => setIntro(false), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nav, setNav] = useState(NAVCFG);
  const [cfade, setCfade] = useState(CONTENT_FADE);
  const [foot, setFoot] = useState(FOOTER);
  const footFrostRef = useRef(null);
  const contentRefs = useRef([]);
  const originRef = useRef({ cx: -9999, cy: -9999, hw: 0, hh: 0 });
  const navRefs = useRef([]);
  const burgerRef = useRef(null);
  const page = PAGES[pageIndex];
  const sections = page.sections;

  const ground = dark ? INK : PAPER;
  const fg = dark ? PAPER : INK;

  // Measured from the rendered footer, then clamped. Everything that depends on
  // the footer's size — the pager's partial lift, the accent gradient's
  // position, the frost's height — reads this one value.
  const [footerH, setFooterH] = useState(0);
  const footerElRef = useRef(null);
  useEffect(() => {
    const el = footerElRef.current;
    if (!el) return;
    const measure = () => {
      const vh = window.innerHeight;
      const natural = el.scrollHeight;
      setFooterH(
        Math.round(
          Math.min(Math.max(natural, (vh * foot.minVh) / 100), (vh * foot.maxVh) / 100)
        )
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [foot.minVh, foot.maxVh, foot.padY, pageIndex]);

  // One gradient per section at its own bottom edge (standard tint), plus ONE
  // for the footer in the accent variant. The footer sits a fraction of a
  // viewport past the last section, hence the fractional position.
  const gradientEntries = useMemo(() => {
    const list = sections.map((s, i) => ({ id: s.id, at: i, footer: false }));
    const vh = typeof window !== "undefined" ? window.innerHeight : 1;
    list.push({
      id: "__footer",
      at: sections.length - 1 + (footerH || 1) / vh,
      footer: true,
    });
    return list;
  }, [sections, footerH]);

  const paging = usePager({
    count: sections.length + 1, // + the footer stop
    reduced,
    viewportRef,
    footerPx: footerH,
  });

  // A page switch remounts the sections, so the fresh DOM children carry no
  // inert attribute until this runs after the render — without it the
  // paged-away sections stay focusable and a focus inside one scrolls the
  // fixed viewport, landing the page on the wrong section.
  useEffect(() => {
    paging.syncInert(paging.activeIndex);
  }, [pageIndex, sections.length, paging.activeIndex, paging.syncInert]);

  // The new page's sections only exist after this commit, so the pager measures
  // them here rather than inside the click that switched pages.
  useEffect(() => {
    paging.remeasure();
  }, [pageIndex, footerH, paging.remeasure]);

  // The viewport is fixed and overflow:hidden, but focus can still scroll it.
  // Anything that moves it gets snapped straight back.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const snap = () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } };
    el.addEventListener("scroll", snap, { passive: true });
    return () => el.removeEventListener("scroll", snap);
  }, []);

  // The menu can only exist from section 2 on; landing back on section 1 shows
  // the nav outright, so an open menu there would be a contradictory state.
  useEffect(() => {
    if (paging.activeIndex === 0) setMenuOpen(false);
  }, [paging.activeIndex]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Pulse origin: the active nav item while the nav is up, the hamburger once
  // it has folded. Sampled after state changes rather than every frame — a
  // per-frame getBoundingClientRect would force layout on top of the canvas loop.
  useEffect(() => {
    const measure = () => {
      const navUp = paging.activeIndex === 0 || menuOpen;
      const el = navUp ? navRefs.current[pageIndex] : burgerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      originRef.current = {
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        hw: r.width / 2,
        hh: r.height / 2,
      };
    };
    measure();
    const ids = [120, 400, 800, 1400].map((t) => setTimeout(measure, t));
    window.addEventListener("resize", measure);
    return () => { ids.forEach(clearTimeout); window.removeEventListener("resize", measure); };
  }, [pageIndex, paging.activeIndex, menuOpen]);

  // Cross-fade the section contents against the pager's live progress. Written
  // straight to the DOM inside one rAF — going through React state here would
  // mean a re-render every frame of an 800ms transition.
  useEffect(() => {
    let on = true;
    let lastP = null;
    const tick = () => {
      if (!on) return;
      const p = paging.progressRef.current;
      if (p !== lastP) {
        lastP = p;
        for (let i = 0; i < contentRefs.current.length; i++) {
          const el = contentRefs.current[i];
          if (!el) continue;
          const d = Math.abs(p - i);
          if (!cfade.enabled) {
            el.style.opacity = "1";
            el.style.transform = "none";
            continue;
          }
          const k = Math.pow(Math.max(0, 1 - d), cfade.sharpness);
          el.style.opacity = String(cfade.floor + (1 - cfade.floor) * k);
          // drift the opposite way to travel, so content feels like it lags
          el.style.transform = `translateY(${(p - i) * cfade.lift}px)`;
        }
      }
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => { on = false; cancelAnimationFrame(id); };
  }, [paging.progressRef, cfade]);

  // Footer frost. Ramps as the footer slides in and covers exactly the part of
  // the viewport the lingering section still occupies — never the footer itself.
  useEffect(() => {
    let on = true;
    let last = null;
    const vh = window.innerHeight || 1;
    const footerStop = sections.length - 1 + (footerH || 1) / vh;
    const lastSection = sections.length - 1;
    const tick = () => {
      if (!on) return;
      const p = paging.progressRef.current;
      if (p !== last) {
        last = p;
        const el = footFrostRef.current;
        if (el) {
          const span = footerStop - lastSection || 1;
          const t = Math.max(0, Math.min(1, (p - lastSection) / span));
          const revealed = t * footerH;
          el.style.height = `calc(100% - ${revealed}px)`;
          el.style.opacity = String(t);
          el.style.backdropFilter = `blur(${foot.frostBlur * t}px)`;
          el.style.webkitBackdropFilter = `blur(${foot.frostBlur * t}px)`;
          el.style.pointerEvents = t > 0.9 ? "auto" : "none";
        }
      }
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => { on = false; cancelAnimationFrame(id); };
  }, [paging.progressRef, sections.length, footerH, foot.frostBlur]);

  // Changing page resets to its first section. Pages have different section
  // counts, so landing on a stale index would otherwise scroll past the end.
  // Changing page resets to its first section. Pages have different section
  // counts, so landing on a stale index would otherwise scroll past the end.
  const goToPage = (i) => {
    if (i === pageIndex) {
      paging.goTo(0);
      return;
    }
    setPageIndex(i);
    paging.reset();
  };

  return (
    <div
      ref={viewportRef}
      style={{
        position: "fixed",
        inset: 0,
        height: "100dvh",
        overflow: "hidden",
        touchAction: "none",
        background: ground,
        fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
        color: fg,
        transition: "background 0.4s ease, color 0.4s ease",
      }}
    >
      {/* ── Spec 4: gradients, fixed, BELOW the matrix ──────────────────── */}
      <GradientLayer progressRef={paging.progressRef} dark={dark} cfg={grad} entries={gradientEntries} />

      {/* ── Spec 3: matrix, FIXED above the gradients ───────────────────── */}
      <MatrixLayer
        cfg={matrix}
        reduced={reduced}
        dark={dark}
        nav={nav}
        originRef={originRef}
        paused={menuOpen}
        region={REGIONS[region]}
        regionOn={sections[paging.activeIndex]?.kind === "focus"}
        regionTop={focusBottom}
      />

      {/* ── Spec 5: nav. Visible on a page's FIRST section; folds into the
          hamburger on any section after it. This is the real driver — the
          pager's section index, not a manual trigger. ─────────────────────── */}
      {intro && <IntroLogo dark={dark} onDone={introDone} />}

      <NavHeader
        pages={PAGES}
        pageIndex={pageIndex}
        onPage={(i) => { goToPage(i); setMenuOpen(false); }}
        folded={paging.activeIndex > 0}
        open={menuOpen}
        onToggle={() => setMenuOpen((o) => !o)}
        cfg={nav}
        fg={fg}
        navRefs={navRefs}
        burgerRef={burgerRef}
        dark={dark}
        logoHidden={intro}
        onDark={() => { darkPinned.current = true; setDark((d) => !d); }}
      />

      {/* Footer frost — demotes the section still showing above the footer.
          Sits above the sections but below the nav frost and header. Its height
          shrinks as the footer is revealed, so it never covers the footer. */}
      <div
        ref={footFrostRef}
        aria-hidden
        onClick={() => paging.goTo(sections.length)}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "100%",
          zIndex: 15,
          opacity: 0,
          pointerEvents: "none",
          background: dark
            ? `rgba(23,19,15,${foot.frostTint})`
            : `rgba(250,248,245,${foot.frostTint})`,
        }}
      />

      {/* ── Spec 5 item 4: frost. Above the sections, below the header, so the
          nav stays sharp while the page behind it is pushed back. ────────── */}
      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 20,
          backdropFilter: menuOpen ? `blur(${nav.blur}px)` : "blur(0px)",
          WebkitBackdropFilter: menuOpen ? `blur(${nav.blur}px)` : "blur(0px)",
          background: dark
            ? `rgba(23,19,15,${menuOpen ? nav.frost : 0})`
            : `rgba(250,248,245,${menuOpen ? nav.frost : 0})`,
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? "auto" : "none",
          transition:
            `backdrop-filter ${nav.frostMs}ms ${EASINGS[nav.frostEase]}, ` +
            `background ${nav.frostMs}ms ${EASINGS[nav.frostEase]}, ` +
            `opacity ${nav.frostMs}ms ${EASINGS[nav.frostEase]}`,
        }}
      />

      {/* ── Spec 1: paged container, sections slide over the matrix ──────── */}
      <div
        ref={paging.containerRef}
        style={{
          position: "relative",
          zIndex: 10,
          willChange: "transform",
          paddingRight: 22,
        }}
      >
        {sections.map((s, i) => (
          <Section
            key={`${page.id}-${s.id}`}
            kind={s.kind}
            dark={dark}
            live={paging.activeIndex === i}
            region={region}
            onRegion={setRegion}
            onFocusBounds={setFocusBottom}
            onGo={(id) => goToPage(PAGES.findIndex((p) => p.id === id))}
            innerRef={(el) => (contentRefs.current[i] = el)}
          />
        ))}
        <SiteFooter dark={dark} innerRef={footerElRef} padY={foot.padY} pages={PAGES} onPage={goToPage} />
      </div>

      {/* ── section indicator ───────────────────────────────────────────── */}
      <nav
        aria-label="Section navigation"
        style={{
          position: "fixed",
          right: 22,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          zIndex: 30,
        }}
      >
        {sections.map((s, i) => (
          <button
            key={s.id}
            aria-label={`Go to ${s.id}`}
            aria-current={paging.activeIndex === i}
            onClick={() => paging.goTo(i)}
            style={{
              width: paging.activeIndex === i ? 18 : 12,
              height: paging.activeIndex === i ? 3 : 2,
              borderRadius: 1.5,
              border: 0,
              background: paging.activeIndex === i ? ACCENT : `${fg}55`,
              padding: 0,
              cursor: "pointer",
              transition: HOVER_T("background", "width", "height"),
            }}
          />
        ))}
        {/* The footer is not a section, so its marker is a dot rather than a
            line — the indicator should not imply "one more page of content". */}
        <button
          aria-label="Go to footer"
          aria-current={paging.activeIndex === sections.length}
          onClick={() => paging.goTo(sections.length)}
          style={{
            width: paging.activeIndex === sections.length ? 5 : 4,
            height: paging.activeIndex === sections.length ? 5 : 4,
            borderRadius: "50%",
            marginTop: 6,
            border: 0,
            background:
              paging.activeIndex === sections.length ? ACCENT : `${fg}55`,
            padding: 0,
            cursor: "pointer",
            transition: HOVER_T("background", "width", "height"),
          }}
        />
      </nav>

      {/* ── dev toggle + panel ──────────────────────────────────────────── */}
      <button
        aria-label="Toggle dev panel"
        onClick={() => setDevOpen((o) => !o)}
        style={{
          position: "fixed",
          left: 16,
          bottom: 16,
          zIndex: 40,
          width: 34,
          height: 34,
          background: devOpen ? INK : "rgba(23,19,15,0.7)",
          color: PAPER,
          border: 0,
          cursor: "pointer",
          fontSize: 16,
        }}
      >
        ⚙
      </button>
      {devOpen && (
        <DevPanel
          matrix={matrix}
          setMatrix={setMatrix}
          grad={grad}
          setGrad={setGrad}
          sectionCount={sections.length}
          nav={nav}
          setNav={setNav}
          cfade={cfade}
          setCfade={setCfade}
          foot={foot}
          setFoot={setFoot}
          reduced={reduced}
          activeIndex={paging.activeIndex}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Spec 1 — pager (inlined; mirrors useSectionPaging, scoped to this shell).
 * ──────────────────────────────────────────────────────────────────────── */
function usePager({ count, reduced, viewportRef, footerPx = 0 }) {
  const containerRef = useRef(null);
  const index = useRef(0);
  const offset = useRef(0);
  const animating = useRef(false);
  const rafId = useRef(null);
  const sectionH = useRef(0);
  const cooldownUntil = useRef(0);
  const samples = useRef([]);
  const prevWheelT = useRef(-1e9);
  const dragging = useRef(false);
  const tStartY = useRef(0);
  const tStartX = useRef(0);
  const axis = useRef(null);
  const tStartOff = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const vel = useRef(0);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const progressRef = useRef(0);
  const footerRef = useRef(footerPx);
  footerRef.current = footerPx;
  const [activeIndex, setActiveIndex] = useState(0);

  const setY = (y) => {
    if (containerRef.current)
      containerRef.current.style.transform = `translateY(${y}px)`;
    // live scroll position in viewport units, for layers that must track the
    // transition frame-by-frame (Spec 4 gradients) without a React re-render
    progressRef.current = sectionH.current ? -y / sectionH.current : 0;
  };

  const syncInert = useCallback((activeIdx) => {
    const kids = containerRef.current?.children;
    if (!kids) return;
    Array.from(kids).forEach((el, i) => {
      if (i === activeIdx) el.removeAttribute("inert");
      else el.setAttribute("inert", "");
    });
  }, []);

  // Every stop is one viewport apart EXCEPT the last one (the footer), which is
  // only the footer's own height away from the section before it.
  const offsetFor = useCallback(
    (i) => {
      const H = sectionH.current;
      const lastSection = count - 2; // index of the section before the footer
      if (footerRef.current <= 0 || i <= lastSection) return -(i * H);
      return -(lastSection * H + footerRef.current);
    },
    [count]
  );

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    sectionH.current = vp.clientHeight;
    offset.current = offsetFor(index.current);
    setY(offset.current);
  }, [viewportRef, offsetFor]);

  const goTo = useCallback(
    (target) => {
      const clamped = Math.max(0, Math.min(target, count - 1));
      if (clamped === index.current || animating.current) return;
      animating.current = true;
      index.current = clamped;
      setActiveIndex(clamped);
      syncInert(clamped);
      const from = offset.current;
      const to = offsetFor(clamped);
      const isRed = reducedRef.current;
      const dur = isRed ? PAGING.reducedDuration : PAGING.duration;
      const ease = isRed ? (t) => t : (t) => 1 - Math.pow(1 - t, PAGING.easePower);
      const start = performance.now();
      cancelAnimationFrame(rafId.current);
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        offset.current = from + (to - from) * ease(t);
        setY(offset.current);
        if (t < 1) rafId.current = requestAnimationFrame(step);
        else {
          offset.current = to;
          setY(to);
          animating.current = false;
        }
      };
      rafId.current = requestAnimationFrame(step);
    },
    [count, syncInert, offsetFor]
  );

  const settleBack = useCallback(() => {
    const to = offsetFor(index.current);
    const from = offset.current;
    const start = performance.now();
    animating.current = true;
    const step = (now) => {
      const t = Math.min(1, (now - start) / 240);
      offset.current = from + (to - from) * (1 - Math.pow(1 - t, 2.4));
      setY(offset.current);
      if (t < 1) requestAnimationFrame(step);
      else {
        offset.current = to;
        animating.current = false;
      }
    };
    requestAnimationFrame(step);
  }, [offsetFor]);

  useEffect(() => {
    measure();
    syncInert(0);

    const onWheel = (e) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= sectionH.current;
      const abs = Math.abs(dy);
      if (abs < 2) return;

      const now = Date.now();

      // A quiet gap means a new, separate gesture — start a fresh sample window
      // so the previous gesture's magnitudes don't skew this one's averages.
      if (now - prevWheelT.current > WHEEL.gestureReset) {
        samples.current = [];
      }
      prevWheelT.current = now;

      // Sample every event, including those swallowed during the lockout: the
      // averages must know how the stream is behaving when the lockout lifts.
      samples.current.push(abs);
      if (samples.current.length > WHEEL.sampleCap) samples.current.shift();

      // Lockout: transition plays in full, then breakAfter of swallowed input.
      if (animating.current || now < cooldownUntil.current) return;

      // Acceleration is the only filter, as in fullPage.js. A momentum tail is
      // decelerating by definition, so its recent average has fallen below its
      // longer-run average and it stays swallowed.
      //
      // A second "peak ratio" gate was tried and REMOVED: momentum arriving
      // after the transition keeps refreshing prevWheelT, so gestureReset never
      // fires and the previous gesture's peak persists. The next swipe was then
      // blocked until it ramped back to 80% of that stale peak — a real,
      // felt delay. The suite passes 9/9 without it, so it bought nothing.
      if (!isAccelerating(samples.current)) return;

      goTo(index.current + (dy > 0 ? 1 : -1));
      cooldownUntil.current = now + PAGING.duration + PAGING.breakAfter;
    };

    const onTS = (e) => {
      dragging.current = true;
      const y = e.touches[0].clientY;
      axis.current = null;
      tStartX.current = e.touches[0].clientX;
      tStartY.current = y;
      lastY.current = y;
      lastT.current = performance.now();
      tStartOff.current = offset.current;
      vel.current = 0;
    };
    const onTM = (e) => {
      if (!dragging.current || animating.current) return;
      const y = e.touches[0].clientY;
      // Lock the gesture to one axis on its first meaningful movement. Anything
      // horizontal belongs to a carousel, not to the pager.
      if (axis.current === null) {
        const adx = Math.abs(e.touches[0].clientX - tStartX.current);
        const ady = Math.abs(y - tStartY.current);
        if (adx < 8 && ady < 8) return;
        axis.current = adx > ady ? "x" : "y";
      }
      if (axis.current === "x") return;
      const now = performance.now();
      const dt = now - lastT.current || 1;
      vel.current = (y - lastY.current) / dt;
      lastY.current = y;
      lastT.current = now;
      let next = tStartOff.current + (y - tStartY.current);
      const min = offsetFor(count - 1);
      if (next > 0) next = next * PAGING.rubberband;
      if (next < min) next = min + (next - min) * PAGING.rubberband;
      offset.current = next;
      setY(next);
    };
    const onTE = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (animating.current) return;
      const moved = offset.current - tStartOff.current;
      const target = index.current + (moved < 0 ? 1 : -1);
      const committed =
        Math.abs(moved) > PAGING.touchDist || Math.abs(vel.current) > PAGING.touchVel;
      // Out-of-range targets must settle, not call goTo: goTo clamps, finds the
      // clamp equals the current index, and returns without animating — which
      // would leave the drag's offset stranded where the finger left it.
      if (committed && target >= 0 && target <= count - 1) goTo(target);
      else settleBack();
    };

    const onKey = (e) => {
      if (animating.current) return;
      const map = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowUp: -1, PageUp: -1 };
      if (e.key in map) {
        e.preventDefault();
        goTo(index.current + map[e.key]);
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(count - 1);
      }
    };

    const onResize = () => measure();

    document.documentElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTS, { passive: true });
    window.addEventListener("touchmove", onTM, { passive: true });
    window.addEventListener("touchend", onTE, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafId.current);
      document.documentElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTS);
      window.removeEventListener("touchmove", onTM);
      window.removeEventListener("touchend", onTE);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [goTo, measure, settleBack, syncInert, count, offsetFor]);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    animating.current = false;
    dragging.current = false;
    index.current = 0;
    offset.current = 0;
    // Re-read the viewport: pages differ in section count and footer height, so
    // a stale sectionH would put every later stop at the wrong offset.
    const vp = viewportRef.current;
    if (vp) sectionH.current = vp.clientHeight;
    setActiveIndex(0);
    setY(0);
    syncInert(0);
    samples.current = [];
    cooldownUntil.current = 0;
  }, [syncInert, viewportRef]);

  return { containerRef, activeIndex, goTo, progressRef, reset, syncInert, remeasure: measure };
}



/* ────────────────────────────────────────────────────────────────────────
 * Placeholder footer. Deliberately NOT a full-height section — reaching it
 * lifts the preceding section by only this height, so that section stays
 * mostly on screen while the footer slides into view beneath it.
 * ──────────────────────────────────────────────────────────────────────── */
function SiteFooter({ dark, innerRef, padY }) {
  const fg = dark ? PAPER : INK;
  const soft = dark ? "#C9C2B8" : "#6B635B";
  const rule = dark ? "#4A423A" : RULE;
  return (
    <footer
      ref={innerRef}
      style={{
        boxSizing: "border-box",
        borderTop: `1px solid ${rule}`,
        padding: `${padY}px clamp(20px,5vw,72px)`,
        display: "flex",
        flexWrap: "wrap",
        gap: "clamp(24px, 4vw, 56px)",
        alignItems: "flex-end",
        justifyContent: "space-between",
        color: fg,
        background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
      }}
    >
      <div style={{ fontSize: UI_SM, color: soft }}>
        Built by <strong style={{ fontWeight: 700 }}>ATIDE</strong> x{" "}
        <strong style={{ fontWeight: 700 }}>B9</strong>
      </div>
      <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
        <img
          src={dark ? LOGO_LIGHT : LOGO_DARK}
          alt="AMP Global"
          style={{ display: "block", width: 168, height: "auto" }}
        />
        <div style={{ fontSize: UI_SM, color: soft }}>
          © 2026 AMP Global. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Spec 5 — the nav header. Three states:
 *   section 1          nav visible, no hamburger
 *   section 2+ closed  hamburger only, nav folded away
 *   section 2+ open    nav back, hamburger is an X, page frosted behind
 * ──────────────────────────────────────────────────────────────────────── */
/* Load intro. Holds the mark full-screen, then FLIPs it onto the nav logo's
   measured rect and hands over. The veil carries the page ground, so nothing
   behind shows until the flight is under way. The intro img is laid out by
   flex centring rather than a percentage transform, leaving `transform` free
   for the flight. */
function IntroLogo({ dark, onDone }) {
  const imgRef = useRef(null);
  // covered → wipe (clip opens left to right) → hold → fly
  const [phase, setPhase] = useState("covered");
  const fly = phase === "fly";

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { const q = setTimeout(onDone, 240); return () => clearTimeout(q); }
    // one frame at the closed clip so the transition has a start value
    const a = requestAnimationFrame(() => setPhase("wipe"));
    const id = setTimeout(() => setPhase("fly"), INTRO.wipe + INTRO.hold);
    return () => { cancelAnimationFrame(a); clearTimeout(id); };
  }, [onDone]);

  useEffect(() => {
    if (!fly) return;
    const img = imgRef.current;
    const target = document.querySelector("[data-nav-logo]");
    if (!img || !target) { onDone(); return; }
    const a = img.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    img.style.transformOrigin = "top left";
    img.style.transition = `transform ${INTRO.fly}ms ${EASINGS["out-quint"]}`;
    img.style.transform =
      `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width})`;
    const id = setTimeout(onDone, INTRO.fly);
    return () => clearTimeout(id);
  }, [fly, onDone]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute", inset: 0,
          background: dark ? INK : PAPER,
          opacity: fly ? 0 : 1,
          transition: `opacity ${Math.round(INTRO.fly * 0.7)}ms ${EASINGS["out-quint"]}`,
        }}
      />
      <img
        ref={imgRef}
        src={dark ? LOGO_LIGHT : LOGO_DARK}
        alt="AMP Global"
        style={{
          position: "relative", display: "block", width: INTRO.size, height: "auto",
          // The mask is dropped for the flight: masking a transform-scaled
          // element resamples it every frame, which is where the residual
          // softness came from. The wipe is over by then, so nothing is lost.
          WebkitMaskImage: fly ? "none" : INTRO.mask,
          maskImage: fly ? "none" : INTRO.mask,
          WebkitMaskSize: "200% 100%",
          maskSize: "200% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: phase === "covered" ? "100% 0" : "0% 0",
          maskPosition: phase === "covered" ? "100% 0" : "0% 0",
          transition: fly
            ? "none"
            : `-webkit-mask-position ${INTRO.wipe}ms ${EASINGS["in-out-quart"]}, ` +
              `mask-position ${INTRO.wipe}ms ${EASINGS["in-out-quart"]}`,
        }}
      />
    </div>
  );
}

function NavHeader({ pages, pageIndex, onPage, folded, open, onToggle, cfg, fg, navRefs, burgerRef, dark, logoHidden, onDark }) {
  const [hovered, setHovered] = useState(-1);
  const ease = EASINGS[cfg.ease];
  const openEase = EASINGS[cfg.openEase];
  const barEase = EASINGS[cfg.barEase];
  const morphEase = EASINGS[cfg.morphEase];

  const navHidden = folded && !open;
  const showBurger = folded;

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px clamp(20px, 5vw, 72px)",
        pointerEvents: "none",
      }}
    >
      <img
        src={dark ? LOGO_LIGHT : LOGO_DARK}
        alt="AMP Global"
        data-nav-logo
        onClick={() => onPage(0)}
        style={{
          display: "block", width: "clamp(96px, 11vw, 148px)", height: "auto",
          pointerEvents: "auto", cursor: "pointer",
          // hidden, not unmounted: the intro measures this element's real rect
          // and hands over on the same pixels, so there is no pop
          visibility: logoHidden ? "hidden" : "visible",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 18, pointerEvents: "auto" }}>
        <nav aria-label="Pages" style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {pages.map((pg, i) => {
            const outLead = pages.length - 1 - i;              // Contact leads out
            const inLead = cfg.reverseOrder ? i : outLead;     // Home leads back in
            const delay = navHidden ? outLead * cfg.stagger : inLead * cfg.openStagger;
            const dur = navHidden ? cfg.travel : cfg.openTravel;
            const curve = navHidden ? ease : openEase;
            const gap = (pages.length - i) * 88 * (cfg.distance / 100);
            const fadeDur = navHidden ? dur * (1 - cfg.fadeStart / 100) : dur;
            const fadeDelay = navHidden ? delay + dur * (cfg.fadeStart / 100) : delay;
            return (
              <button
                key={pg.id}
                ref={(el) => (navRefs.current[i] = el)}
                onClick={() => onPage(i)}
                aria-current={pageIndex === i}
                aria-hidden={navHidden}
                tabIndex={navHidden ? -1 : 0}
                onMouseEnter={() => !navHidden && setHovered(i)}
                onMouseLeave={() => setHovered(-1)}
                onFocus={() => !navHidden && setHovered(i)}
                onBlur={() => setHovered(-1)}
                style={{
                  background: "none",
                  border: 0,
                  padding: 0,
                  cursor: navHidden ? "default" : "pointer",
                  fontFamily: "inherit",
                  fontSize: UI_SM,
                  whiteSpace: "nowrap",
                  fontWeight: pageIndex === i ? 700 : 400,
                  color: pageIndex === i ? ACCENT : fg,
                  transform: navHidden ? `translateX(${gap}px)` : "translateX(0)",
                  opacity: navHidden ? 0 : 1,
                  pointerEvents: navHidden ? "none" : "auto",
                  transition:
                    `transform ${dur}ms ${curve} ${delay}ms, ` +
                    `opacity ${fadeDur}ms ${curve} ${fadeDelay}ms`,
                }}
              >
                {/* hover scale on a NESTED element: the button's own transform is
                    owned by the fold (1180ms + stagger), so sharing the property
                    would make hover inherit that timing. */}
                <span
                  style={{
                    display: "inline-block",
                    transform: `scale(${hovered === i ? cfg.hoverScale : 1})`,
                    transition: `transform ${cfg.hoverMs}ms ${EASINGS[cfg.hoverEase]}`,
                  }}
                >
                  {pg.label}
                </span>
              </button>
            );
          })}
        </nav>

        <button
          onClick={onDark}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          aria-pressed={dark}
          style={{
            width: 30, height: 30,
            border: 0, background: "none", color: fg,
            cursor: "pointer", fontSize: UI_SM, lineHeight: 1,
            display: "grid", placeItems: "center", flexShrink: 0,
          }}
        >
          {dark ? (
            /* sun: filled disc with rays, shown when dark mode is on */
            <svg
              width="17" height="17" viewBox="0 0 34 34" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden
            >
              <circle cx="17" cy="17" r="6.5" fill="currentColor" stroke="none" />
              <path d="M17 2.5v4M17 27.5v4M2.5 17h4M27.5 17h4M6.7 6.7l2.9 2.9M24.4 24.4l2.9 2.9M27.3 6.7l-2.9 2.9M9.6 24.4l-2.9 2.9" />
            </svg>
          ) : (
            /* crescent, cut by a mask so the arc keeps an even weight */
            <svg width="17" height="17" viewBox="0 0 34 34" aria-hidden>
              <mask id="amp-moon">
                <rect width="34" height="34" fill="#000" />
                <circle cx="17" cy="17" r="11" fill="#fff" />
                <circle cx="25.5" cy="12" r="10" fill="#000" />
              </mask>
              <rect width="34" height="34" fill="currentColor" mask="url(#amp-moon)" />
            </svg>
          )}
        </button>

        <button
          ref={burgerRef}
          onClick={onToggle}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-hidden={!showBurger}
          tabIndex={showBurger ? 0 : -1}
          style={{
            width: 26, height: 18, position: "relative", flexShrink: 0,
            background: "none", border: 0, padding: 0,
            cursor: showBurger ? "pointer" : "default",
            pointerEvents: showBurger ? "auto" : "none",
          }}
        >
          {[0, 1, 2].map((b) => {
            const toCentre = open ? (1 - b) * 8 : 0;
            const rot = open ? (b === 0 ? 45 : b === 2 ? -45 : 0) : 0;
            const vanish = open && b === 1;
            return (
              <span
                key={b}
                style={{
                  position: "absolute", left: 0, top: b * 8, height: 2,
                  background: fg,
                  width: showBurger ? "100%" : "0%",
                  opacity: !showBurger || vanish ? 0 : 1,
                  transformOrigin: "center center",
                  transform: `translateY(${toCentre}px) rotate(${rot}deg)`,
                  transition:
                    `width ${cfg.barTravel}ms ${barEase} ${b * cfg.barStagger}ms, ` +
                    `opacity ${open ? cfg.morph : cfg.barTravel}ms ${open ? morphEase : barEase} ${open ? 0 : b * cfg.barStagger}ms, ` +
                    `transform ${cfg.morph}ms ${morphEase}`,
                }}
              />
            );
          })}
        </button>
      </div>
    </header>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Spec 4 — gradient layer.
 *
 * All gradients live on ONE fixed layer, positioned in VIEWPORT space from the
 * pager's live progress. A gradient nested inside a section would be bounded by
 * that section and cut at the seam as it drifts; hoisting them removes the
 * constraint instead of fighting it.
 *
 * Each box is TWO viewports tall and centred on its section's bottom edge, so
 * the ellipse is drawn WHOLE. A one-viewport box ending at the ellipse centre
 * paints only the upper half, leaving a hard flat cut that becomes visible the
 * moment the gradient drifts.
 *
 * Updates run imperatively inside one rAF, writing styles only when progress
 * actually changes — so tracking the transition costs no React re-renders.
 * ──────────────────────────────────────────────────────────────────────── */
function GradientLayer({ progressRef, dark, cfg, entries }) {
  const refs = useRef([]);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    let on = true;
    let lastP = null;
    let lastDark = null;
    let lastSig = null;
    const tick = () => {
      if (!on) return;
      const p = progressRef.current;
      const c = cfgRef.current;
      const d0 = darkRef.current;
      // The config must be part of the dirty check, not just progress: while the
      // pager sits still, progress never changes, so without this a panel slider
      // would never be written to the DOM and the controls would look dead.
      const sig = JSON.stringify(c);
      if (p !== lastP || d0 !== lastDark || sig !== lastSig) {
        lastP = p;
        lastDark = d0;
        lastSig = sig;
        for (let i = 0; i < entries.length; i++) {
          const el = refs.current[i];
          if (!el) continue;
          // entries carry their own position in progress-space, so the footer
          // can sit at a FRACTIONAL index — it is only part of a viewport past
          // the last section, not a whole one.
          const d = p - entries[i].at;
          if (Math.abs(d) > 1.4) { el.style.display = "none"; continue; }
          const g = entries[i].footer ? c.footer : c.standard;
          const opacity = c.fade.enabled
            ? Math.pow(Math.max(0, 1 - Math.abs(d)), c.fade.sharpness)
            : 1;
          if (opacity <= 0.001) { el.style.display = "none"; continue; }
          const driftVh = c.fade.enabled
            ? Math.max(-1, Math.min(1, d)) * c.fade.drift
            : 0;
          el.style.display = "block";
          el.style.top = `${-d * 100}%`;
          el.style.transform = `translateY(${driftVh}vh)`;
          el.style.opacity = String(opacity);
          el.style.background = gradientCss(g, d0);
        }
      }
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => { on = false; cancelAnimationFrame(id); };
  }, [progressRef, entries]);

  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden" }}>
      {entries.map((e, i) => (
        <div
          key={e.id}
          ref={(el) => (refs.current[i] = el)}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "200%",
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
}

function gradientCss(cfg, dark) {
  // "ground" is a tint of the surface: a LIGHT bloom on ink, a warm DARK bloom
  // on paper. The two must be picked for comparable contrast against their own
  // ground — rule tone on paper is ~7x weaker than paper on ink, which made the
  // light-mode gradient effectively invisible at the tuned opacity.
  const rgb =
    cfg.colorMode === "accent"
      ? "249,96,61"
      : cfg.colorMode === "ink"
      ? "23,19,15"
      : dark
      ? "250,248,245" // light bloom on ink
      : "58,51,44"; // warm dark bloom on paper (INK_SOFT)
  const a = cfg.opacity;
  // Box is 2 viewports tall with the ellipse at its centre, so the vertical
  // radius is halved for `height` to still read as a % of ONE viewport.
  const ry = cfg.height / 2;
  return (
    `radial-gradient(ellipse ${cfg.spreadX}% ${ry}% at 50% 50%, ` +
    `rgba(${rgb},${a}) 0%, ` +
    `rgba(${rgb},${(a * 0.45).toFixed(3)}) ${cfg.midStop}%, ` +
    `rgba(${rgb},0) ${cfg.feather}%)`
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Spec 3 — matrix layer, fixed behind the pager.
 * ──────────────────────────────────────────────────────────────────────── */
function MatrixLayer({ cfg, reduced, dark, nav, originRef, paused, region, regionOn, regionTop }) {

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const mouse = useRef({ x: -9999, y: -9999, active: false });
  const grid = useRef({ cols: 0, rows: 0, w: 0, h: 0, dpr: 1 });
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const navRef = useRef(nav);
  navRef.current = nav;
  // Frozen while the menu is frosted: the grid is ambient, nobody reads it
  // through a blur, and backdrop-filter would otherwise force the browser to
  // re-blur a full-viewport canvas on every one of these frames.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // AMP mark rasterised to grid resolution; the sweep samples it per dot.
  const maskRef = useRef(null);
  const logoRef = useRef(null);

  // Layout plan §4 — the active region's projection, rasterised to the grid and
  // cross-faded when the region buttons cycle.
  const regionRef = useRef({ from: null, to: null, start: 0 });
  const regionOnRef = useRef(regionOn);
  regionOnRef.current = regionOn;
  const regionTopRef = useRef(regionTop);
  regionTopRef.current = regionTop;

  const buildRegionMask = useCallback((dots) => {
    const g = grid.current;
    if (!dots || !g.cols || !g.rows) return null;
    const c = cfgRef.current;
    const rc = dots[0].length;
    const rr = dots.length;
    const src = document.createElement("canvas");
    src.width = rc;
    src.height = rr;
    const sctx = src.getContext("2d");
    const id = sctx.createImageData(rc, rr);
    for (let r = 0; r < rr; r++) {
      for (let cc = 0; cc < rc; cc++) {
        id.data[(r * rc + cc) * 4 + 3] = dots[r][cc] === "1" ? 255 : 0;
      }
    }
    sctx.putImageData(id, 0, 0);
    const off = document.createElement("canvas");
    off.width = g.cols;
    off.height = g.rows;
    const octx = off.getContext("2d");
    // The map lives in the space left under the section's copy, measured from
    // the live layout rather than a guessed fraction of the viewport.
    const topRow = ((regionTopRef.current || 0) + c.regionGap) / c.cell;
    const botRow = (g.h - Math.min(64, g.h * 0.06)) / c.cell;
    const availRows = Math.max(10, botRow - topRow);
    let boxW = g.cols * c.regionWidth;
    let boxH = boxW * (rr / rc);
    if (boxH > availRows) { boxH = availRows; boxW = boxH * (rc / rr); }
    // nearest-neighbour: one source cell becomes a block of dots, so the map
    // reads as part of the grid instead of a blurred blob
    octx.imageSmoothingEnabled = false;
    octx.drawImage(src, (g.cols - boxW) / 2, topRow + (availRows - boxH) / 2, boxW, boxH);
    const d = octx.getImageData(0, 0, g.cols, g.rows).data;
    const m = new Float32Array(g.cols * g.rows);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
    return m;
  }, []);

  const setRegionMask = useCallback((mask) => {
    const rs = regionRef.current;
    const now = performance.now();
    const b = Math.min(1, (now - rs.start) / Math.max(1, cfgRef.current.regionFade));
    let snap = null;
    if (rs.from || rs.to) {
      const len = (rs.to || rs.from).length;
      snap = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        snap[i] = (rs.from ? rs.from[i] * (1 - b) : 0) + (rs.to ? rs.to[i] * b : 0);
      }
    }
    regionRef.current = { from: snap, to: mask, start: now };
  }, []);

  const buildMask = useCallback(() => {
    const img = logoRef.current;
    const g = grid.current;
    if (!img || !g.cols || !g.rows) return;
    const c = cfgRef.current;
    const off = document.createElement("canvas");
    off.width = g.cols;
    off.height = g.rows;
    const octx = off.getContext("2d");
    let boxW = g.cols * c.logoWidth;
    let boxH = boxW * (img.naturalHeight / img.naturalWidth);
    const maxH = g.rows * 0.62;
    if (boxH > maxH) { boxH = maxH; boxW = boxH * (img.naturalWidth / img.naturalHeight); }
    octx.drawImage(img, (g.cols - boxW) / 2, (g.rows - boxH) / 2, boxW, boxH);
    const d = octx.getImageData(0, 0, g.cols, g.rows).data;
    const m = new Float32Array(g.cols * g.rows);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
    maskRef.current = m;
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => { logoRef.current = img; buildMask(); };
    img.src = LOGO_DARK;
  }, [buildMask]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const cell = cfgRef.current.cell;
    grid.current = { cols: Math.ceil(w / cell) + 1, rows: Math.ceil(h / cell) + 1, w, h, dpr };
    maskRef.current = null;
    buildMask();
  }, [buildMask]);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [resize]);

  useEffect(() => resize(), [cfg.cell, resize]);
  useEffect(() => buildMask(), [cfg.logoWidth, buildMask]);
  useEffect(() => {
    setRegionMask(regionOn ? buildRegionMask(region?.dots) : null);
  }, [region, regionOn, regionTop, cfg.regionWidth, cfg.regionGap, cfg.cell, buildRegionMask, setRegionMask]);

  // mouse read from the window (canvas is pointer-events:none)
  useEffect(() => {
    const onMove = (e) => {
      mouse.current = { x: e.clientX, y: e.clientY, active: true };
    };
    const onLeave = () => (mouse.current.active = false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let flashStart = performance.now() + 1000;
    let mounted = true;

    const draw = (now) => {
      if (!mounted) return;
      if (pausedRef.current) { requestAnimationFrame(draw); return; }
      const c = cfgRef.current;
      const nv = navRef.current;
      const g = grid.current;
      const { dpr } = g;
      // dot colour follows the ground: ink dots on paper, paper dots on ink
      const [r, gg, b] = darkRef.current ? [250, 248, 245] : [23, 19, 15];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, g.w, g.h);

      // reduced motion: suppress the sweep, keep grid + cursor. The focus
      // section belongs to the region map, so the logo sweep sits out.
      const sweepOn = !reducedRef.current && !regionOnRef.current;
      let bandX = null;
      let flashPhase = 0;
      if (sweepOn) {
        const cycle = (c.flashInterval + c.sweepDuration) * 1000;
        const t = (now - flashStart) % cycle;
        if (t < c.sweepDuration * 1000) {
          flashPhase = t / (c.sweepDuration * 1000);
          bandX = -c.bandWidth + flashPhase * (g.w + c.bandWidth * 2);
        }
      }

      const mx = mouse.current.x;
      const my = mouse.current.y;
      const cursorOn = mouse.current.active;
      const cr = c.cursorRadius;
      const cr2 = cr * cr;

      // Spec 5 item 5 — a ring leaving the active nav item's FRAME
      const o = originRef?.current;
      const usePulse = nv?.pulseOn && o && o.cx > -9000 && !reducedRef.current;
      let ringR = 0, ringAmp = 0;
      if (usePulse) {
        const t = (now % nv.pulsePeriod) / nv.pulsePeriod;
        ringR = t * nv.pulseMax;
        ringAmp = Math.pow(1 - t, 1.6);
      }

      const LEVELS = 16;
      const buckets = [];
      for (let i = 0; i < LEVELS; i++) buckets.push([]);

      const mask = maskRef.current;
      const rs = regionRef.current;
      const rBlend = Math.min(1, (now - rs.start) / Math.max(1, c.regionFade));
      const rOn = !!(rs.from || rs.to);
      for (let row = 0; row < g.rows; row++) {
        const y = row * c.cell;
        const rowOff = row * g.cols;
        for (let col = 0; col < g.cols; col++) {
          const x = col * c.cell;
          let opacity = c.baseOpacity;
          let radius = c.dot;
          let ci = 0;
          if (cursorOn) {
            const dx = x - mx;
            const dy = y - my;
            const d2 = dx * dx + dy * dy;
            if (d2 < cr2) {
              ci = Math.pow(1 - Math.sqrt(d2) / cr, c.cursorFalloff);
              opacity += ci * c.cursorStrength;
              radius = c.dot * (1 + ci * (c.dotGrow - 1));
            }
          }
          if (usePulse && ringAmp > 0.002) {
            // Distance to the button's rounded-rect FRAME, not its centre, so
            // the ring traces the button outline as it expands.
            let dist;
            if (nv.pulseShape === "circle") {
              const px = x - o.cx, py = y - o.cy;
              dist = Math.sqrt(px * px + py * py);
            } else {
              const rr = Math.min(nv.pulseCorner, o.hw + nv.pulsePadX, o.hh + nv.pulsePadY);
              const qx = Math.abs(x - o.cx) - (o.hw + nv.pulsePadX - rr);
              const qy = Math.abs(y - o.cy) - (o.hh + nv.pulsePadY - rr);
              const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
              dist = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
            }
            const band = Math.abs(dist - ringR);
            if (band < nv.pulseWidth) {
              const pi = Math.pow(1 - band / nv.pulseWidth, nv.pulseFalloff) * ringAmp;
              opacity += pi * nv.pulseStrength;
              radius = Math.max(radius, c.dot * (1 + pi * (nv.pulseGrow - 1)));
            }
          }

          if (rOn) {
            const rv =
              (rs.from ? rs.from[rowOff + col] * (1 - rBlend) : 0) +
              (rs.to ? rs.to[rowOff + col] * rBlend : 0);
            if (rv > 0.01) {
              opacity += rv * c.regionOpacity;
              radius = Math.max(radius, c.dot * (1 + rv * (c.regionGrow - 1)));
            }
          }

          if (bandX !== null) {
            const bd = Math.abs(x - bandX);
            if (bd < c.bandWidth) {
              let bi = 1 - bd / c.bandWidth;
              bi *= bi;
              const env = Math.sin(flashPhase * Math.PI);
              const mk = mask ? mask[rowOff + col] : 0;
              const amp = bi * env;
              let flash = amp * (c.flashOpacity * c.logoResidual + c.logoOpacity * mk);
              if (ci > 0) flash *= 1 + ci * (c.flashBoostUnderCursor - 1);
              opacity += flash;
              if (mk > 0.2) {
                radius = Math.max(radius, c.dot * (1 + amp * mk * (c.logoGrow - 1)));
              }
            }
          }
          if (opacity <= 0.008) continue;
          if (opacity > 1) opacity = 1;
          buckets[(opacity * (LEVELS - 1)) | 0].push(x, y, radius);
        }
      }

      ctx.fillStyle = `rgb(${r},${gg},${b})`;
      for (let level = 1; level < LEVELS; level++) {
        const arr = buckets[level];
        if (arr.length === 0) continue;
        ctx.globalAlpha = level / (LEVELS - 1);
        ctx.beginPath();
        for (let i = 0; i < arr.length; i += 3) {
          ctx.moveTo(arr[i] + arr[i + 2], arr[i + 1]);
          ctx.arc(arr[i], arr[i + 1], arr[i + 2], 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    };
    const id = requestAnimationFrame(draw);
    return () => {
      mounted = false;
      cancelAnimationFrame(id);
    };
  }, [originRef]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Sections — the real AMP site content, clamp-sized to fit one viewport
 * (Spec 2). Each section is height:100dvh and centres content that never
 * overflows; the interactive cycles (pillars, edges, regions) live inside
 * their own section so paging never resets an unrelated one.
 * ──────────────────────────────────────────────────────────────────────── */
/* Region grids rasterised from Natural Earth (world-atlas 110m) geometry:
   d3.geoMercator fitted to each region's countries, 40 x 34 sample grid. */
const REGIONS = [
  { name: "Africa", dots: ["0000000000000111100000000000000000000000","0000000000111111100000000000000000000000","0000000001111111111000100000000000000000","0000000011111111111111111111000000000000","0000000011111111111111111111000000000000","0000000111111111111111111110000000000000","0000001111111111111111111111000000000000","0000011111111111111111111111100000000000","0000011111111111111111111111100000000000","0000001111111111111111111111100000000000","0000011111111111111111111111110000000000","0000011111111111111111111111111000000000","0000001111111111111111111111111000000000","0000000111111111111111111111111111100000","0000000111111111111111111111111111000000","0000000001010001111111111111111111000000","0000000000000000011111111111111110000000","0000000000000000011111111111111100000000","0000000000000000011111111111111000000000","0000000000000000001111111111110000000000","0000000000000000001111111111110000000000","0000000000000000001111111111110000000000","0000000000000000000111111111110000000000","0000000000000000001111111111110000100000","0000000000000000001111111111110001100000","0000000000000000001111111111100011000000","0000000000000000001111111111000011000000","0000000000000000000111111111000011000000","0000000000000000000111111111000010000000","0000000000000000000111111110000000000000","0000000000000000000011111110000000000000","0000000000000000000011111100000000000000","0000000000000000000001111000000000000000","0000000000000000000001110000000000000000"] },
  { name: "MENA", dots: ["0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000001111100000000000000111100000000","0000011111111100000000000000111110000000","0000111111111110000000000001111110000000","0000111111111111100111100001111111000000","0000111111111111111111111111111111000000","0001111111111111111111111111111111000000","0011011111111111111111111110111111100000","0110001111111111111111111110111111110100","1100000011111110101111111110011111111111","0000000001111000000011000000011111111111","0000000000010000000000000000001111111110","0000000000000000000000000000000111111100","0000000000000000000000000000000111110000","0000000000000000000000000000000111000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000"] },
  { name: "India & South Asia", dots: ["0000000000001000000000000000000000000000","0000000110111011000000000000000000000000","0000001111111111100000000000000000000000","0000011111111111111000000000000000000000","0001111111111111111100000000000000000000","0001111111111111111100000000000000000000","0001111111111111111100000000000000000000","0001111111111111111100000000000000000000","0000111111111111111100000000000000000000","0001111111111111111111100000000000000000","0001111111111111111111111000000000000000","0000111111111111111111111100000001110000","0000011111111111111111111111101111111000","0000011111111111111111111111111111100000","0000111111111111111111111111111111100000","0000000001111111111111111111111111100000","0000000000111111111111111111111111000000","0000000000011111111111111111111010000000","0000000000011111111111111111100010000000","0000000000000011111111111111000000000000","0000000000000011111111111100000000000000","0000000000000011111111111000000000000000","0000000000000011111111110000000000000000","0000000000000001111111100000000000000000","0000000000000001111110000000000000000000","0000000000000000111110000000000000000000","0000000000000000111110000000000000000000","0000000000000000111110000000000000000000","0000000000000000011110000000000000000000","0000000000000000011110000000000000000000","0000000000000000001100000000000000000000","0000000000000000001001000000000000000000","0000000000000000000001100000000000000000","0000000000000000000001100000000000000000"] },
  { name: "Latin America", dots: ["0000001101000000000000000000000000000000","0000000011110000000000000000000000000000","0000000001110000000000000000000000000000","0000000000111000000000000000000000000000","0000000000111001000100000000000000000000","0000000000011111000101000000000000000000","0000000000000011110000000000000000000000","0000000000000000100001000000000000000000","0000000000000000010010111000000000000000","0000000000000000000011111100000000000000","0000000000000000000111111110000000000000","0000000000000000000111111111000000000000","0000000000000000000111111111111000000000","0000000000000000001111111111111111000000","0000000000000000000111111111111111000000","0000000000000000000011111111111110000000","0000000000000000000011111111111100000000","0000000000000000000000111111111100000000","0000000000000000000000111111111100000000","0000000000000000000000111111111000000000","0000000000000000000000111111100000000000","0000000000000000000000111111100000000000","0000000000000000000001111111000000000000","0000000000000000000001111111000000000000","0000000000000000000001111100000000000000","0000000000000000000001111100000000000000","0000000000000000000001111000000000000000","0000000000000000000001110000000000000000","0000000000000000000011100000000000000000","0000000000000000000011100000000000000000","0000000000000000000011100000000000000000","0000000000000000000011000000000000000000","0000000000000000000011100000000000000000","0000000000000000000001110000000000000000"] }
];

function Section({ kind, dark, live, innerRef, onGo, region, onRegion, onFocusBounds }) {
  const t = {
    fg: dark ? PAPER : INK,
    soft: dark ? "#C9C2B8" : "#6B635B",
    body: dark ? "#D6CFC5" : INK_SOFT,
    rule: dark ? "#4A423A" : RULE,
    // Opaque in both modes. Dark is a neutral grey rather than a tint of the
    // warm ink ground, which read as reddish against the paper-toned palette.
    card: dark ? "#242426" : "#FFFFFF",
    // Near-opaque rather than backdrop-filtered: the pager's transform makes a
    // backdrop root, so a blur here can never sample the fixed matrix behind
    // it. A heavy tint lets the sweep read as faint texture instead of dots.
    field: dark ? "rgba(34,28,23,0.9)" : "rgba(255,255,255,0.92)",
    dim: dark ? "#8C8478" : "#8C847A",
    off: dark ? "rgba(255,255,255,0.13)" : "#E4DED4",
    btnBg: dark ? PAPER : INK,
    btnFg: dark ? INK : PAPER,
    // lifts the outline CTA off the matrix without filling it in
    btnFrost: dark ? "rgba(46,39,32,0.72)" : "rgba(255,255,255,0.72)",
    dark,
  };
  return (
    <section
      style={{
        height: "100dvh",
        display: "flex",
        alignItems: "center",
        // Top pad clears the fixed header (~83px at its largest); the bottom pad
        // keeps content off the section's gradient edge. Both are vh-relative so
        // a short viewport spends its height on content, not on padding.
        padding: "clamp(64px, 9vh, 104px) clamp(20px, 5vw, 72px) clamp(28px, 5vh, 72px)",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: "100%", maxWidth: 1280, margin: "0 auto", willChange: "opacity, transform",
          ...(kind === "focus" ? { alignSelf: "stretch" } : null),
        }}
      >
        {kind === "hero" && <Hero t={t} onGo={onGo} />}
        {kind === "approach" && <Approach t={t} />}
        {kind === "focus" && <Focus t={t} live={live} active={region} onActive={onRegion} onBounds={onFocusBounds} />}
        {kind === "whatWeDo" && <WhatWeDo t={t} live={live} />}
        {kind === "edge" && <Edge t={t} live={live} />}
        {kind === "who" && <Who t={t} />}
        {kind === "team" && <Team t={t} />}
        {kind === "contact" && <ContactStatement t={t} />}
        {kind === "proposal" && <Proposal t={t} />}
      </div>
    </section>
  );
}

const H2 = {
  margin: 0,
  fontSize: "clamp(1.75rem, 3.4vw, 3rem)",
  lineHeight: 1.08,
  letterSpacing: "-0.025em",
  fontWeight: 400,
};
const BODY = { margin: 0, fontSize: "1.0625rem", lineHeight: 1.65 };
/* Type scale — every size on the site comes from here. */
const D1 = {
  margin: 0, fontSize: "clamp(2.4rem, 5.6vw, 5.2rem)", lineHeight: 0.98,
  letterSpacing: "-0.035em", fontWeight: 400,
};
const H3 = {
  margin: 0, fontSize: "clamp(1.25rem, 2.2vw, 1.75rem)", lineHeight: 1.3,
  letterSpacing: "-0.02em", fontWeight: 500,
};
const SUB = { fontSize: "1.125rem", fontWeight: 600, letterSpacing: "-0.01em" };
const LEAD = { margin: 0, fontSize: "clamp(1.0625rem, 1.3vw, 1.25rem)", lineHeight: 1.55 };
const LIST = { fontSize: "clamp(1.25rem, 2.2vw, 1.75rem)", letterSpacing: "-0.02em" };
const LIST_CAPS = { fontSize: "clamp(1rem, 1.6vw, 1.25rem)", letterSpacing: "0.06em", textTransform: "uppercase" };
const SMALL = "0.9375rem";
const MICRO = "0.8125rem";
const UI = 15;
const UI_SM = 14;
/* Soft-cornered, following the logo's rounded strokes. */
const RADIUS = { control: 4, box: 6 };
/* Hover/selection easing, shared by every cyclable option so the three cycles
   move on one curve. out-quint: quick to commit, long to settle. */
const HOVER_MS = 320;
const HOVER_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const HOVER_T = (...props) => props.map((p) => `${p} ${HOVER_MS}ms ${HOVER_EASE}`).join(", ");
/* Pointer feedback is a separate job from a selection change. 320ms is right
   for a selection settling (a region becoming active, a rail bar filling), but
   on a control you sweep past it trails the cursor. Buttons and arrows use the
   faster pair; the curve is shared so the two still feel related. */
const HOVER_FAST_MS = 200;
const HOVER_FAST_T = (...props) => props.map((p) => `${p} ${HOVER_FAST_MS}ms ${HOVER_EASE}`).join(", ");
const TWOCOL = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
  gap: "clamp(28px, 5vw, 80px)",
  alignItems: "start",
};
const EYEBROW = {
  fontSize: "0.6875rem",
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

function Hero({ t, onGo }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ ...TWOCOL, position: "relative" }}>
        <h1
          style={{
            ...D1, textWrap: "balance",
          }}
        >
          Investing In The Future Of{" "}
          <span style={{ fontWeight: 700, letterSpacing: "-0.045em" }}>Global</span> Music Culture
        </h1>
        <div
          style={{
            borderLeft: `1px solid ${t.rule}`, paddingLeft: "clamp(20px, 3vw, 44px)",
            display: "grid", gap: 28, justifyItems: "start",
          }}
        >
          <p style={{ ...LEAD, color: t.body, maxWidth: "46ch" }}>
            AMP Global is a music investment platform focused on high-growth markets,
            partnering with creators, rights holders, and local ecosystems to build
            long-term value.
          </p>
          <button
            onClick={() => onGo("contact")}
            style={{
              display: "inline-flex", alignItems: "center", padding: "14px 28px",
              border: `1px solid ${ACCENT}`, borderRadius: RADIUS.control,
              background: ACCENT, color: INK,
              transition: HOVER_FAST_T("background", "border-color", "color"),
              fontFamily: "inherit", fontSize: UI, fontWeight: 500,
              whiteSpace: "nowrap", cursor: "pointer",
            }}
          >
            Submit Proposal
          </button>
        </div>
      </div>
    </div>
  );
}

function Approach({ t }) {
  return (
    <div style={TWOCOL}>
      <div style={{ display: "grid", gap: 22 }}>
        <p style={{ ...BODY, color: t.body, maxWidth: "58ch" }}>
          AMP Global invests in and develops music rights and music-driven platforms
          across emerging and underserved regions, where culture is growing faster
          than capital.
        </p>
        <p style={{ ...BODY, color: t.body, maxWidth: "58ch" }}>
          Our approach goes beyond ownership. We partner locally, invest patiently,
          and apply global best practices to support sustainable growth across music
          ecosystems.
        </p>
      </div>
      <h2 style={{ ...H2, alignSelf: "stretch", borderLeft: `1px solid ${t.rule}`, paddingLeft: "clamp(20px, 3vw, 44px)" }}>
        A Long-Term,{" "}
        <span style={{ fontWeight: 700, letterSpacing: "-0.035em" }}>Global</span> Approach To Music IP.
      </h2>
    </div>
  );
}

/* ── Options cycle ──────────────────────────────────────────────────────────
   Layout plan: a section marked with the cycle star advances through its own
   options by itself, and whatever sits beside them follows — a copy block in
   What We Do and Our Edge, the background map projection in Focus Regions.
   One behaviour for all of them:
     - it only runs while that section is the one on screen, so a paged-away
       section is not burning a timer or arriving mid-cycle
     - any pointer or keyboard touch hands control to the user, and it picks
       back up only after they have gone idle
     - one keyboard model: arrows step through the options, wrapping
     - prefers-reduced-motion stops the automatic advance; the options stay
       fully operable by hand */
const CYCLE_MS = 5600;
// Focus Regions reads faster — one word per option, and the map does the talking.
const CYCLE_MS_FAST = 3800;
const CYCLE_RESUME_MS = 9000;

function useOptionCycle(count, { live, value, onChange, interval = CYCLE_MS } = {}) {
  const [internal, setInternal] = useState(0);
  const controlled = typeof value === "number";
  const index = controlled ? value : internal;
  const indexRef = useRef(index);
  indexRef.current = index;

  const [held, setHeld] = useState(false);
  const holdTimer = useRef(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const select = useCallback(
    (i) => {
      const n = ((i % count) + count) % count;
      indexRef.current = n;
      if (onChange) onChange(n);
      if (!controlled) setInternal(n);
    },
    [count, controlled, onChange]
  );

  const hold = useCallback(() => {
    setHeld(true);
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setHeld(false), CYCLE_RESUME_MS);
  }, []);

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const running = !!live && !held && !reduced && count > 1;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => select(indexRef.current + 1), interval);
    return () => clearInterval(id);
  }, [running, interval, select]);

  // spread on the element wrapping the options
  const group = {
    onKeyDown: (e) => {
      const d =
        e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 :
        e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      hold();
      select(indexRef.current + d);
    },
    onPointerDown: hold,
    onMouseEnter: hold,
    onMouseLeave: hold,
  };

  const pick = (i) => () => { hold(); select(i); };
  return { index, select, hold, running, group, pick };
}

/* Focus Regions — layout plan §4. The map is NOT in the section: the region
   cycle drives the projection drawn by the background matrix. */
function Focus({ t, live, active, onActive, onBounds }) {
  const cyc = useOptionCycle(REGIONS.length, { live, value: active, onChange: onActive, interval: CYCLE_MS_FAST });
  const copyRef = useRef(null);
  useEffect(() => {
    const report = () => {
      const el = copyRef.current;
      const sec = el?.closest("section");
      if (!el || !sec || !onBounds) return;
      // measured against the section, so a paged-away section still reports
      // the same value it will have when it is the one on screen
      onBounds(el.getBoundingClientRect().bottom - sec.getBoundingClientRect().top);
    };
    report();
    const ro = new ResizeObserver(report);
    if (copyRef.current) ro.observe(copyRef.current);
    window.addEventListener("resize", report);
    return () => { ro.disconnect(); window.removeEventListener("resize", report); };
  }, [onBounds]);
  return (
    <div style={{ height: "100%", display: "grid", alignContent: "start" }}>
    <div
      ref={copyRef}
      style={{
        display: "grid", gap: "clamp(20px, 5vh, 56px)",
        justifyItems: "center", textAlign: "center",
      }}
    >
      <h2 style={H2}>Focus Regions</h2>
      <div
        style={{
          width: "100%", display: "grid", justifyItems: "center",
          gap: "clamp(14px, 2.6vh, 28px)",
        }}
      >
      <p style={{ ...H3, color: t.body, maxWidth: "46ch", fontWeight: 400 }}>
        We focus on regions with strong cultural output, expanding audiences, and
        long-term growth potential.
      </p>
      <div
        {...cyc.group}
        style={{
          width: "100%", display: "flex", flexWrap: "wrap",
          justifyContent: "center", alignItems: "baseline",
          gap: "clamp(14px, 3vw, 56px)",
        }}
      >
        {REGIONS.map((r, i) => (
          <button
            key={r.name}
            onMouseEnter={cyc.pick(i)}
            onFocus={cyc.pick(i)}
            onClick={cyc.pick(i)}
            aria-current={active === i}
            style={{
              padding: 0, background: "none", border: 0, cursor: "pointer",
              fontFamily: "inherit", ...LIST_CAPS,
              fontWeight: active === i ? 600 : 400,
              color: active === i ? t.fg : t.soft,
              transition: HOVER_T("color", "opacity"),
              opacity: active === i ? 1 : 0.7,
            }}
          >
            {r.name}
          </button>
        ))}
      </div>
      </div>
    </div>
    </div>
  );
}

function WhatWeDo({ t, live }) {
  const cyc = useOptionCycle(PILLARS.length, { live });
  const active = cyc.index;
  return (
    <div style={{ display: "grid", gap: "clamp(18px, 4vh, 64px)" }}>
      <h2 style={{ ...H2, textAlign: "center" }}>What We Do</h2>
      <div style={TWOCOL}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "clamp(20px, 4vh, 48px)" }}>
          <p
            style={{
              ...LEAD, color: t.soft, maxWidth: "34ch",
            }}
          >
            A holistic investment strategy built for long-term value creation.
          </p>
          <div {...cyc.group} style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {PILLARS.map(([title], i) => (
              <button
                key={title}
                onMouseEnter={cyc.pick(i)}
                onFocus={cyc.pick(i)}
                onClick={cyc.pick(i)}
                aria-current={active === i}
                style={{
                  padding: "13px 30px", borderRadius: RADIUS.control,
                  border: `1px solid ${active === i ? ACCENT : t.rule}`,
                  background: active === i ? ACCENT : "transparent",
                  color: active === i ? INK : t.fg,
                  fontFamily: "inherit", fontSize: UI, fontWeight: 500, cursor: "pointer",
                  transition: HOVER_T("background", "border-color", "color"),
                }}
              >
                {title}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            borderLeft: `1px solid ${t.rule}`, paddingLeft: "clamp(20px, 3vw, 44px)",
            minHeight: "clamp(104px, 20vh, 148px)",
            display: "flex", alignItems: "center",
          }}
        >
          <p
            style={{
              ...H3, maxWidth: "40ch",
            }}
          >
            {PILLARS[active][1]}
          </p>
        </div>
      </div>
    </div>
  );
}

function Edge({ t, live }) {
  const cyc = useOptionCycle(EDGES.length, { live });
  const active = cyc.index;
  return (
    <div style={{ display: "grid", gap: "clamp(18px, 4vh, 64px)" }}>
      <h2 style={{ ...H2, textAlign: "center" }}>Our Edge</h2>
      <div style={TWOCOL}>
        <ul {...cyc.group} style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
          {EDGES.map(([title, , icon], i) => (
            <li key={title}>
              <button
                onMouseEnter={cyc.pick(i)}
                onFocus={cyc.pick(i)}
                onClick={cyc.pick(i)}
                aria-current={active === i}
                style={{
                  display: "flex", alignItems: "center", gap: 16, width: "100%",
                  padding: "12px 0", background: "none", border: 0, textAlign: "left",
                  cursor: "pointer", fontFamily: "inherit",
                  ...LIST,
                  fontWeight: 500,
                  letterSpacing: active === i ? "-0.008em" : "-0.02em",
                  color: active === i ? ACCENT : t.fg,
                  transition: HOVER_T("color", "letter-spacing", "opacity"),
                  opacity: active === i ? 1 : 0.62,
                }}
              >
                <span
                  style={{
                    flex: "none", display: "grid", placeItems: "center",
                    color: active === i ? ACCENT : t.dim,
                    transform: active === i ? "scale(1)" : "scale(0.86)",
                    transition: HOVER_T("color", "transform", "opacity"),
                  }}
                >
                  <EdgeIcon shape={icon} />
                </span>
                <span>{title}</span>
              </button>
            </li>
          ))}
        </ul>
        <div
          style={{
            borderLeft: `1px solid ${t.rule}`, paddingLeft: "clamp(20px, 3vw, 44px)",
            minHeight: "clamp(96px, 19vh, 140px)",
            alignSelf: "stretch", display: "flex", alignItems: "center",
          }}
        >
          <p
            style={{
              ...H3, maxWidth: "30ch",
            }}
          >
            {EDGES[active][1]}
          </p>
        </div>
      </div>
    </div>
  );
}

const WHO = [
  ["Artists and creators", "head"],
  ["Catalogue owners and rights holders", "catalogue"],
  ["Independent labels and platforms", "record"],
  ["Strategic partners and investors", "partners"],
];

function WhoIcon({ shape }) {
  const common = { width: 26, height: 26, viewBox: "0 0 34 34", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true };
  if (shape === "head")
    return (
      <svg {...common} strokeLinecap="round">
        <circle cx="17" cy="12" r="7" />
        <path d="M5.5 30c1.8-6.2 5.9-9.2 11.5-9.2s9.7 3 11.5 9.2" />
      </svg>
    );
  if (shape === "curve")
    return (
      <svg {...common} strokeLinecap="round">
        <path d="M2 17c3.2 0 4-11 7.2-11s4 22 7.2 22 4-16.5 7.2-16.5S29 17 32 17" />
      </svg>
    );
  if (shape === "headphones")
    return (
      <svg {...common}>
        <path d="M5.5 21v-4a11.5 11.5 0 0 1 23 0v4" strokeLinecap="round" />
        <rect x="3" y="20" width="6" height="10" rx="3" />
        <rect x="25" y="20" width="6" height="10" rx="3" />
      </svg>
    );
  if (shape === "wave")
    return (
      <svg {...common} strokeLinecap="round">
        <path d="M3 17v0M8 11v12M13 6v22M18 9.5v15M23 13v8M28 15.5v3" />
      </svg>
    );
  if (shape === "mic")
    return (
      <svg {...common}>
        <rect x="12.5" y="3" width="9" height="16" rx="4.5" />
        <path d="M7.5 15.5a9.5 9.5 0 0 0 19 0" strokeLinecap="round" />
        <path d="M17 25v6" strokeLinecap="round" />
      </svg>
    );
  if (shape === "catalogue")
    return (
      <svg {...common}>
        <rect x="4" y="6" width="18" height="22" rx="1.5" />
        <path d="M26 9.5c2 .6 3 1.2 3 2.4V26c0 1.4-1.3 2-3 2.4" strokeLinecap="round" />
        <path d="M9 13h8M9 18h8" strokeLinecap="round" />
      </svg>
    );
  if (shape === "record")
    return (
      <svg {...common}>
        <circle cx="17" cy="17" r="13" />
        <circle cx="17" cy="17" r="6" />
        <circle cx="17" cy="17" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    );
  if (shape === "partners")
    return (
      <svg {...common}>
        <circle cx="12" cy="17" r="9" />
        <circle cx="22" cy="17" r="9" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d={shape} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Who({ t }) {
  return (
    <div style={{ display: "grid", gap: "clamp(18px, 4vh, 64px)" }}>
      <div style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center" }}>
        <h2 style={H2}>Who We Work With</h2>
      </div>
      <div
        style={{
          display: "grid", justifyItems: "center",
          gap: "clamp(14px, 2.6vh, 28px)",
        }}
      >
        <p style={{ ...BODY, color: t.soft }}>We collaborate across the music ecosystem, including:</p>
      <div
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
          gap: "clamp(14px, 1.6vw, 20px)",
        }}
      >
        {WHO.map(([label, shape]) => (
          <div
            key={label}
            style={{
              border: `1px solid ${t.rule}`, borderRadius: RADIUS.box,
              background: t.card, padding: "clamp(16px, 2.6vh, 22px)",
              display: "grid", gap: "clamp(16px, 4.5vh, 34px)", alignContent: "start",
              justifyItems: "center", textAlign: "center", color: t.fg,
            }}
          >
            <span style={{ display: "grid", placeItems: "center", color: ACCENT }}>
              <WhoIcon shape={shape} />
            </span>
            <div style={{ ...EYEBROW, fontSize: SMALL, letterSpacing: "0.06em", lineHeight: 1.45, maxWidth: "18ch" }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

const FounderCard = ({ t, name, role, photo, w }) => (
  <div
    style={{
      boxSizing: "border-box",
      border: `1px solid ${t.rule}`, borderRadius: RADIUS.box,
      background: t.card, padding: "clamp(12px, 1.8vh, 16px)",
      width: w, maxWidth: "100%", minWidth: 0, height: "100%",
      display: "grid", gridTemplateColumns: "minmax(0, 1fr)",
      gap: "clamp(12px, 2vh, 18px)", alignContent: "start",
    }}
  >
    <img
      src={photo}
      alt={name}
      style={{
        width: "100%", aspectRatio: "3 / 4",
        objectFit: "cover", objectPosition: "center top",
        display: "block",
        borderRadius: RADIUS.control,
        background: t.dark ? "rgba(255,255,255,0.05)" : "#EFEAE2",
        border: `1px solid ${t.rule}`,
      }}
    />
    <div>
      <div style={{ ...SUB, letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1.3, minHeight: "2.6em" }}>
        {name}
      </div>
      <div style={{ marginTop: 6, fontSize: SMALL, color: t.soft }}>{role}</div>
    </div>
  </div>
);

/* Founders row. Three cards sit side by side while the row has room for them;
   below that width it becomes a carousel rather than wrapping a card onto a
   second line, which the section's fixed height would clip. The threshold is
   measured from the row itself, not from a viewport breakpoint, because the
   row's width also depends on the section padding and the indicator rail. */
function FoundersRow({ t }) {
  const n = FOUNDERS.length;
  const GAP = 20;
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);
  const [vh, setVh] = useState(0);
  const [i, setI] = useState(0);
  const [drag, setDrag] = useState(0);
  const dragRef = useRef(0);
  const g = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setW(el.clientWidth);
    setVh(window.innerHeight);
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
      ro.observe(el);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, []);

  // The card's proportions are fixed: the portrait is always 3:4, so the card
  // is sized by WIDTH alone and the width is derived from the viewport height.
  // Capping the image height instead (the earlier approach) cropped the
  // portrait and changed the card's ratio at some zoom levels.
  const CARD_W = Math.max(176, Math.min(248, Math.round((vh || 900) * 0.26)));
  const fits = w === 0 || w >= n * CARD_W + (n - 1) * GAP;
  const slideW = Math.min(CARD_W, Math.max(170, w - 56));
  const step = slideW + GAP;
  const perView = Math.max(1, Math.floor((w + GAP) / step));
  const maxI = Math.max(0, n - perView);
  const at = Math.min(i, maxI);

  const onDown = (e) => {
    if (fits) return;
    g.current = { x: e.clientX };
    dragRef.current = 0;
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!g.current) return;
    let d = (e.clientX - g.current.x) / step;
    if ((at === 0 && d > 0) || (at === maxI && d < 0)) d *= 0.35;
    dragRef.current = d;
    setDrag(d);
  };
  const onUp = () => {
    if (!g.current) return;
    g.current = null;
    const d = dragRef.current;
    dragRef.current = 0;
    if (d < -0.18 && at < maxI) setI(at + 1);
    else if (d > 0.18 && at > 0) setI(at - 1);
    setDrag(0);
  };

  if (fits) {
    return (
      <div ref={wrapRef} style={{ width: "100%", minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "nowrap", gap: GAP, justifyContent: "start" }}>
          {FOUNDERS.map(([name, role, photo]) => (
            <FounderCard key={name} t={t} name={name} role={role} photo={photo} w={CARD_W} />
          ))}
        </div>
      </div>
    );
  }

  const arrow = (dir) => {
    const to = at + dir;
    const off = to < 0 || to > maxI;
    return (
      <button
        type="button"
        onClick={() => !off && setI(to)}
        disabled={off}
        aria-label={dir < 0 ? "Previous founder" : "Next founder"}
        style={{
          width: 40, height: 40, display: "grid", placeItems: "center",
          border: 0,
          background: "transparent", color: off ? t.rule : ACCENT,
          opacity: off ? 0.45 : 1,
          cursor: off ? "default" : "pointer",
          transition: HOVER_FAST_T("opacity", "color"),
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <polyline points={dir < 0 ? "9.5,3 4.5,8 9.5,13" : "6.5,3 11.5,8 6.5,13"} />
        </svg>
      </button>
    );
  };

  return (
    <div ref={wrapRef} style={{ display: "grid", gap: 14, width: "100%", minWidth: 0 }}>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ overflow: "hidden", cursor: "grab", touchAction: "pan-y" }}
      >
        <div
          style={{
            display: "flex",
            gap: GAP,
            transform: `translateX(${(-at + drag) * step}px)`,
            transition: drag ? "none" : `transform 420ms ${EASINGS["out-quint"]}`,
            willChange: "transform",
          }}
        >
          {FOUNDERS.map(([name, role, photo], idx) => (
            <div
              key={name}
              style={{
                flex: `0 0 ${slideW}px`,
                display: "flex",
                opacity: idx >= at && idx < at + perView ? 1 : 0.5,
                transition: `opacity 420ms ${EASINGS["out-quint"]}`,
              }}
            >
              <FounderCard t={t} name={name} role={role} photo={photo} w="100%" />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {arrow(-1)}
        {arrow(1)}
      </div>
    </div>
  );
}

function Team({ t }) {
  return (
    <div style={{ display: "grid", gap: "clamp(18px, 4vh, 64px)" }}>
      <div style={TWOCOL}>
        <h2 style={H2}>Team &amp; Advisors</h2>
        <p
          style={{
            ...BODY, borderLeft: `1px solid ${t.rule}`,
            paddingLeft: "clamp(20px, 3vw, 44px)", color: t.body, maxWidth: "46ch",
          }}
        >
          A global team with deep experience across music, investment, and emerging markets.
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gap: "clamp(14px, 2.2vh, 22px)",
          alignContent: "start",
          width: "100%",
          minWidth: 0,
        }}
      >
        <div style={{ ...EYEBROW, color: t.soft }}>Founders</div>
        <div style={{ width: "100%", minWidth: 0, overflow: "hidden" }}>
          <FoundersRow t={t} />
        </div>
      </div>
    </div>
  );
}

function ContactStatement({ t }) {
  return (
    <div style={TWOCOL}>
      <h2
        style={{
          ...D1, maxWidth: "20ch",
        }}
      >
        Building the Next Chapter of{" "}
        <span style={{ fontWeight: 700, letterSpacing: "-0.04em" }}>Global</span> Music
      </h2>
      <div
        style={{
          borderLeft: `1px solid ${t.rule}`, paddingLeft: "clamp(20px, 3vw, 44px)",
          display: "grid", gap: 24, justifyItems: "start",
        }}
      >
        <p style={{ ...LEAD, color: t.body, maxWidth: "46ch" }}>
          AMP Global exists to support the long-term growth of music ecosystems
          worldwide, investing patiently, partnering locally, and thinking globally.
        </p>
        <a
          href="mailto:info@ampglobalent.com"
          style={{
            ...SUB, fontWeight: 500, color: t.fg,
            borderBottom: `1px solid ${t.rule}`, paddingBottom: 2, textDecoration: "none",
          }}
        >
          info@ampglobalent.com
        </a>
      </div>
    </div>
  );
}

function Proposal({ t }) {
  const [sent, setSent] = useState(false);
  const field = {
    padding: "clamp(9px, 1.4vh, 13px) 14px", background: t.field, border: `1px solid ${t.rule}`,
    borderRadius: RADIUS.control, fontFamily: "inherit", fontSize: UI, letterSpacing: 0,
    textTransform: "none", color: t.fg,
    width: "100%", boxSizing: "border-box", minWidth: 0, maxWidth: "100%",
  };
  const label = { display: "grid", gap: 8, minWidth: 0, ...EYEBROW, color: t.soft };
  return (
    <div style={TWOCOL}>
      <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <h3 style={H2}>
          Submit Proposal
        </h3>
        <p style={{ ...BODY, color: t.soft, maxWidth: "34ch" }}>
          Tell us about your proposal and we'll get in touch.
        </p>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); setSent(true); }}
        style={{
          borderLeft: `1px solid ${t.rule}`, paddingLeft: "clamp(20px, 3vw, 44px)",
          display: "grid", gap: "clamp(10px, 1.7vh, 18px)",
        }}
      >
        <label style={label}>
          Name
          <input type="text" name="name" style={field} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "clamp(10px, 1.7vh, 18px)" }}>
          <label style={label}>
            Email
            <input type="email" name="email" style={field} />
          </label>
          <label style={label}>
            Phone
            <input type="tel" name="phone" style={field} />
          </label>
        </div>
        <label style={label}>
          Message
          <textarea name="message" rows={3} style={{ ...field, minHeight: "clamp(56px, 11vh, 104px)", height: "auto", resize: "vertical" }} />
        </label>
        <div
          style={{
            border: `1px dashed ${t.dark ? "#5A5147" : "#CFC7BC"}`, borderRadius: RADIUS.box,
            background: t.field,
            padding: "clamp(12px, 2vh, 20px)", display: "grid", gap: 6, textAlign: "center",
          }}
        >
          <div style={{ fontSize: SMALL, fontWeight: 500 }}>Choose file or drag &amp; drop</div>
          <div style={{ fontSize: MICRO, color: t.soft }}>ZIP / MP3 / WAV / PDF / XLSX · max 15MB</div>
        </div>
        <button
          type="submit"
          style={{
            justifySelf: "start", padding: "clamp(10px, 1.7vh, 14px) 28px", background: ACCENT, color: INK,
            border: `1px solid ${ACCENT}`, borderRadius: RADIUS.control,
            fontFamily: "inherit", fontSize: UI,
            fontWeight: 500, whiteSpace: "nowrap", cursor: "pointer",
            transition: HOVER_FAST_T("background", "border-color", "color"),
          }}
        >
          Submit Proposal
        </button>
        {sent && (
          <p style={{ margin: 0, fontSize: SMALL, color: ACCENT }}>
            Thanks — we'll be in touch at the address you provided.
          </p>
        )}
      </form>
    </div>
  );
}

/* ── dev panel (behind toggle) ──────────────────────────────────────────── */
function DevPanel({ matrix, setMatrix, grad, setGrad, nav, setNav, cfade, setCfade, foot, setFoot, reduced, activeIndex, sectionCount }) {
  const set = (k) => (e) => setMatrix((m) => ({ ...m, [k]: parseFloat(e.target.value) }));
  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        bottom: 60,
        zIndex: 40,
        width: 280,
        maxHeight: "calc(100vh - 90px)",
        overflowY: "auto",
        background: "rgba(23,19,15,0.94)",
        color: PAPER,
        border: `1px solid ${RULE}33`,
        padding: 16,
        fontSize: 12,
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>merge · dev</div>
      <div style={{ opacity: 0.6, marginBottom: 12, fontFamily: "ui-monospace, monospace" }}>
        section {activeIndex + 1}/{sectionCount} · reduced-motion{" "}
        {reduced ? "ON" : "off"}
      </div>
      <Row label="cell" v={matrix.cell} min={3} max={20} step={1} on={set("cell")} />
      <Row label="base opacity" v={matrix.baseOpacity} min={0.02} max={0.4} step={0.01} on={set("baseOpacity")} />
      <Row label="cursor radius" v={matrix.cursorRadius} min={20} max={200} step={5} on={set("cursorRadius")} />
      <Row label="cursor strength" v={matrix.cursorStrength} min={0} max={1} step={0.05} on={set("cursorStrength")} />
      <Row label="falloff" v={matrix.cursorFalloff} min={0.5} max={5} step={0.1} on={set("cursorFalloff")} />
      <Row label="dot grow" v={matrix.dotGrow} min={1} max={4} step={0.1} on={set("dotGrow")} />
      <Row label="logo width" v={matrix.logoWidth} min={0.3} max={1} step={0.02} on={set("logoWidth")} />
      <Row label="logo opacity" v={matrix.logoOpacity} min={0.2} max={1} step={0.05} on={set("logoOpacity")} />
      <Row label="band residual" v={matrix.logoResidual} min={0} max={1} step={0.05} on={set("logoResidual")} />
      <Row label="region width" v={matrix.regionWidth} min={0.2} max={0.9} step={0.02} on={set("regionWidth")} />
      <Row label="region gap" v={matrix.regionGap} min={0} max={120} step={4} on={set("regionGap")} />
      <Row label="region opacity" v={matrix.regionOpacity} min={0.1} max={1} step={0.05} on={set("regionOpacity")} />

      <div style={{ fontWeight: 700, margin: "14px 0 6px" }}>spec 4 · gradient</div>
      <Row label="std opacity" v={grad.standard.opacity} min={0} max={1} step={0.02}
        on={(e) => setGrad((g) => ({ ...g, standard: { ...g.standard, opacity: +e.target.value } }))} />
      <Row label="std height" v={grad.standard.height} min={8} max={90} step={1}
        on={(e) => setGrad((g) => ({ ...g, standard: { ...g.standard, height: +e.target.value } }))} />
      <Row label="std spread" v={grad.standard.spreadX} min={40} max={260} step={5}
        on={(e) => setGrad((g) => ({ ...g, standard: { ...g.standard, spreadX: +e.target.value } }))} />
      <Row label="footer opacity" v={grad.footer.opacity} min={0} max={1} step={0.02}
        on={(e) => setGrad((g) => ({ ...g, footer: { ...g.footer, opacity: +e.target.value } }))} />
      <Row label="footer height" v={grad.footer.height} min={8} max={100} step={1}
        on={(e) => setGrad((g) => ({ ...g, footer: { ...g.footer, height: +e.target.value } }))} />
      <Row label="drift" v={grad.fade.drift} min={-80} max={80} step={2}
        on={(e) => setGrad((g) => ({ ...g, fade: { ...g.fade, drift: +e.target.value } }))} />
      <div style={{ fontWeight: 700, margin: "14px 0 6px" }}>footer frost</div>
      <Row label="blur" v={foot.frostBlur} min={0} max={20} step={0.25}
        on={(e) => setFoot((f) => ({ ...f, frostBlur: +e.target.value }))} />
      <Row label="tint" v={foot.frostTint} min={0} max={0.8} step={0.01}
        on={(e) => setFoot((f) => ({ ...f, frostTint: +e.target.value }))} />
      <Row label="footer padding" v={foot.padY} min={8} max={80} step={2}
        on={(e) => setFoot((f) => ({ ...f, padY: +e.target.value }))} />

      <div style={{ fontWeight: 700, margin: "14px 0 6px" }}>content cross-fade</div>
      <Row label="sharpness" v={cfade.sharpness} min={0.5} max={5} step={0.1}
        on={(e) => setCfade((c) => ({ ...c, sharpness: +e.target.value }))} />
      <Row label="lift" v={cfade.lift} min={-80} max={80} step={2}
        on={(e) => setCfade((c) => ({ ...c, lift: +e.target.value }))} />
      <Row label="opacity floor" v={cfade.floor} min={0} max={0.8} step={0.02}
        on={(e) => setCfade((c) => ({ ...c, floor: +e.target.value }))} />

      <div style={{ fontWeight: 700, margin: "14px 0 6px" }}>spec 5 · nav</div>
      <Row label="pulse strength" v={nav.pulseStrength} min={0} max={1} step={0.02}
        on={(e) => setNav((n) => ({ ...n, pulseStrength: +e.target.value }))} />
      <Row label="pulse reach" v={nav.pulseMax} min={80} max={700} step={10}
        on={(e) => setNav((n) => ({ ...n, pulseMax: +e.target.value }))} />
      <Row label="pulse period" v={nav.pulsePeriod} min={600} max={6000} step={100}
        on={(e) => setNav((n) => ({ ...n, pulsePeriod: +e.target.value }))} />
      <Row label="frost blur" v={nav.blur} min={0} max={24} step={0.25}
        on={(e) => setNav((n) => ({ ...n, blur: +e.target.value }))} />
      <Row label="frost tint" v={nav.frost} min={0} max={0.8} step={0.01}
        on={(e) => setNav((n) => ({ ...n, frost: +e.target.value }))} />

      <Row label="sharpness" v={grad.fade.sharpness} min={0.5} max={6} step={0.1}
        on={(e) => setGrad((g) => ({ ...g, fade: { ...g.fade, sharpness: +e.target.value } }))} />
      <p style={{ opacity: 0.5, lineHeight: 1.5, marginTop: 10 }}>
        Regression harness. Matrix stays fixed while sections page over it; sweep
        cuts under reduced-motion. Values default to the locked Spec 3 set.
      </p>
    </div>
  );
}

function Row({ label, v, min, max, step, on }) {
  return (
    <label style={{ display: "block", margin: "6px 0" }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: RULE }}>{v}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={on} style={{ width: "100%", accentColor: ACCENT }} />
    </label>
  );
}

return AmpShell;

})();
const MobileShell = (function () {
const { useEffect, useRef, useState, useCallback, useMemo } = React;

/**
 * AMP Global — MOBILE shell. Fork of amp-shell.jsx: same pager, matrix,
 * gradients and intro; single-column sections, hamburger-only nav with a
 * full-screen menu, touch-sized targets, reading type held at 16px minimum.
 *
 * AMP Global — Merged Shell (Specs 1 + 2 + 3)
 *
 * First accretion merge. Three settled behaviours combined into one prototype
 * with the real AMP homepage content, ahead of layering Spec 4 (gradient) and
 * the eventual Claude Design handoff.
 *
 *   Spec 1  Section paging    — hijacked pager, one section per gesture.
 *   Spec 2  Responsive layout — fluid clamp sizing inside each section.
 *   Spec 3  Matrix overlay    — ambient dot grid + cursor field, FIXED behind
 *                               the pager (does not translate with sections).
 *
 * Integration decisions this merge resolves (the things isolation hid):
 *   - Matrix sits behind the paged container (z-index) and is position:fixed, so
 *     it stays put while sections slide over it. pointer-events:none so it never
 *     steals input from the pager; the cursor field reads window mouse coords.
 *   - Both the pager and the matrix take height from the same 100dvh source, so
 *     they agree on iOS with the dynamic toolbar.
 *   - One prefers-reduced-motion read drives BOTH: pager transition shortens
 *     (stays physical, per the Spec 1 decision) AND the matrix sweep is
 *     suppressed while the static grid + cursor field remain.
 *   - Clamp sizing runs inside translated, inert-toggled sections and still
 *     honours the must-fit contract.
 *
 * Dev tuning panel is behind a toggle (the small ⚙ button), OFF by default, so
 * the shell reads as a clean prototype. Locked Spec 3 values are the defaults.
 */

const PAPER = "#FAF8F5";
const INK = "#17130F";
const ACCENT = "#F9603D";
const RULE = "#DDD6CC";
const INK_SOFT = "#3A332C";

// Locked Spec 3 values (from the isolated harness).
const MATRIX = {
  cell: 5,
  dot: 0.5,
  baseOpacity: 0.1,
  cursorRadius: 40,
  cursorStrength: 0.2,
  cursorFalloff: 2.7,
  dotGrow: 2.3,
  flashInterval: 2.5,
  sweepDuration: 2.6,
  bandWidth: 300,
  flashOpacity: 0.45,
  flashBoostUnderCursor: 1.1,
  // The sweep IS the AMP mark: the travelling band only lights the dots that
  // fall inside the logo, so the wordmark writes itself across the grid.
  logoWidth: 0.92,     // mark width as a fraction of the viewport
  logoOpacity: 0.62,   // added opacity for a dot fully inside the mark
  logoResidual: 0.3,   // how much of flashOpacity the off-mark band keeps
  logoGrow: 2.0,       // dot growth inside the mark
  // Layout plan §4: on the Focus section the matrix ALSO shows the map of the
  // current region, and the projection changes as the region buttons cycle.
  regionWidth: 0.6,   // map width as a fraction of the viewport
  regionGap: 42,       // px between the copy and the top of the map
  regionOpacity: 0.44,
  regionGrow: 2.6,
  regionFade: 420,     // ms cross-fade between projections
};

// Locked Spec 1 values.
const PAGING = {
  duration: 800, // ms, section transition — plays in full
  easePower: 3.2,
  breakAfter: 0, // no artificial break: the animation itself is the only gate.
  // fullPage.js works this way (canScroll re-enables exactly when the transition
  // ends) and relies on acceleration detection alone to reject the momentum
  // tail. An added break was only ever compensating for an over-long synthetic
  // momentum model; real trackpad tails run 0.5-2s and are rejected on merit.
  touchDist: 60, // px, touch commit distance
  touchVel: 0.45, // px/ms, touch commit (fling) velocity
  rubberband: 0.5, // end-overscroll resistance
  reducedDuration: 260, // ms cap under prefers-reduced-motion
};

// Spec 4 — section gradient. Settled values from the isolated harness.
// Section content cross-fade during a paging transition. The sections already
// slide as a block; this fades the CONTENT of the outgoing section out and the
// incoming one in on top of that, so a transition reads as a change of subject
// rather than a rigid panel slide.
const CONTENT_FADE = {
  enabled: true,
  sharpness: 1.9, // higher = content disappears sooner into the move
  lift: 26, // px of counter-drift; 0 = pure fade
  floor: 0, // opacity never drops below this (0 = fades fully out)
};

// The footer is NOT a full-height section. Reaching it shifts the preceding
// section up by just the footer's height, so that section stays mostly on
// screen while the footer is revealed beneath it. That makes the last stop a
// PARTIAL move, which is why the pager needs a per-stop offset rather than a
// uniform index * viewportHeight.
const FOOTER = {
  // The footer is sized by its CONTENT, not by a fixed fraction of the
  // viewport: it is measured after layout and that height is what the pager
  // lifts the preceding section by. padY controls how snug it feels.
  padY: 34, // px, vertical breathing room above/below the content
  minVh: 18, // floor, so a very short footer still reads as a panel
  maxVh: 55, // ceiling, so it can never swallow the section above it
  // When the footer is revealed, the section above it is still mostly on
  // screen. Frosting that leftover body demotes it so the footer reads as the
  // focus rather than as a strip under a still-dominant section.
  frostBlur: 4,
  frostTint: 0.22,
};

const GRADIENT = {
  standard: { colorMode: "ground", spreadX: 60, height: 20, opacity: 0.16, midStop: 30, feather: 100 },
  footer: { colorMode: "accent", spreadX: 75, height: 32, opacity: 0.38, midStop: 29, feather: 100 },
  fade: { enabled: true, sharpness: 2.2, drift: 64 },
};

// Wheel gesture detection by acceleration.
//
// Per-event delta comparison cannot separate a user's scroll from a trackpad's
// momentum tail: browsers deliver INTEGER-quantized deltas, so a decaying tail
// produces flat plateaus (24,24,23,23,22,22…) that read as "not decaying" and
// punch through any per-event threshold.
//
// Comparing two rolling averages fixes this. Momentum decays, so its recent
// average falls below its longer-run average; a user actively driving the wheel
// keeps the recent average at or above it. Averaging smooths the quantization
// that defeats per-event tests. (Approach learned from fullPage.js, which is
// GPL-3.0 — this is an independent implementation of the idea, not its code.)
const WHEEL = {
  sampleCap: 150, // max retained samples
  winRecent: 10, // short window — "right now"
  winLong: 70, // long window — "this gesture so far"
  gestureReset: 200, // ms of quiet that starts a fresh sample window
};

// Average of the last `size` samples, divided by the WINDOW size rather than the
// sample count. Early in a gesture the long window is therefore diluted, so the
// recent window clears it easily and the first movement registers immediately.
function windowAvg(samples, size) {
  const from = Math.max(samples.length - size, 0);
  let sum = 0;
  for (let i = from; i < samples.length; i++) sum += samples[i];
  return sum / size;
}

function isAccelerating(samples) {
  return (
    windowAvg(samples, WHEEL.winRecent) >= windowAvg(samples, WHEEL.winLong)
  );
}

// Spec 5 — nav interactions. Settled in the isolated harness.
const EASINGS = {
  "out-quint": "cubic-bezier(0.22, 1, 0.36, 1)",
  "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
  "in-out-quart": "cubic-bezier(0.76, 0, 0.24, 1)",
  "out-back": "cubic-bezier(0.34, 1.4, 0.64, 1)",
};

const NAVCFG = {
  // fold out (item 1) — rightmost leads
  travel: 1180, stagger: 70, ease: "out-quint", fadeStart: 0, distance: 40,
  barTravel: 420, barStagger: 95, barEase: "out-expo",
  // menu opens (item 2) — opposite direction, order reversed
  openTravel: 720, openStagger: 70, openEase: "out-expo", reverseOrder: true,
  morph: 380, morphEase: "in-out-quart",
  // hover (item 3)
  hoverScale: 1.12, hoverMs: 220, hoverEase: "out-back",
  // frost (item 4)
  blur: 5, frost: 0.18, frostMs: 420, frostEase: "out-quint", contentScale: 0.985,
  // active pulse (item 5)
  pulseOn: true, pulsePeriod: 2600, pulseMax: 140, pulseWidth: 40,
  pulseStrength: 0.28, pulseFalloff: 3.0, pulseGrow: 1.5,
  pulseShape: "frame", pulsePadX: 14, pulsePadY: 10, pulseCorner: 10,
};

// Real AMP site structure: five pages, each with its own sections.
// Section counts deliberately differ per page — routing has to cope with that,
// and "nav visible on the first section of each page" only means something once
// pages actually exist.
const PAGES = [
  {
    id: "home",
    label: "Home",
    sections: [
      { id: "hero", kind: "hero" },
      { id: "approach", kind: "approach" },
      { id: "focus", kind: "focus" },
    ],
  },
  {
    id: "about",
    label: "About",
    sections: [
      { id: "what-we-do", kind: "whatWeDo" },
      { id: "edge", kind: "edge" },
      { id: "who", kind: "who" },
    ],
  },
  {
    id: "team",
    label: "Team",
    sections: [{ id: "team", kind: "team" }],
  },
  {
    id: "contact",
    label: "Contact",
    sections: [
      { id: "contact-statement", kind: "contact" },
      { id: "contact-form", kind: "proposal" },
    ],
  },
];

// Load intro: the mark is wiped in left to right, holds, then flies into the
// nav slot. The wipe is a clip-path inset animation on the img itself — one
// compositable property, no mask image and no second element to keep in sync.
// The flight is a measured FLIP onto the real nav logo, so the handover lands
// on the same pixels and reads as one continuous object.
const INTRO = {
  wipe: 900, hold: 1000, fly: 1100, size: "min(76vw, 400px)",
  // Opaque through the mask's left half, then the soft ramp, then clear. The
  // 50% stop matters: at the final mask position the element shows exactly that
  // left half, so anything less leaves the mark's right edge half-faded.
  mask: "linear-gradient(90deg, #000 0%, #000 50%, rgba(0,0,0,0.4) 57%, rgba(0,0,0,0) 66%, rgba(0,0,0,0) 100%)",
};

const LOGO_DARK = "assets/amp-logo-black.png";
const LOGO_LIGHT = "assets/amp-logo-white.png";

const PILLARS = [
  ["Invest", "We deploy capital into music rights and platforms with long-term growth potential."],
  ["Build", "We actively support development, optimisation, and scale, not passive ownership."],
  ["Partner", "We collaborate with creators, rights holders, and local partners to align incentives and unlock value."],
];

const EDGES = [
  ["Local Access", "On-the-ground insight and trusted regional relationships.", "pin"],
  ["Disciplined Capital", "Institutional approach to valuation, risk, and long-term returns.", "scale"],
  ["Build, Not Just Buy", "Active ownership focused on development and scale.", "build"],
  ["Data-Informed Strategy", "Using analytics and technology to support smarter decisions and monetisation.", "data"],
];

/* Our Edge marks. Same 34-unit grid and 1.6 stroke as the Who icons, so the
   two sets read as one family. */
function EdgeIcon({ shape }) {
  const common = {
    width: 22, height: 22, viewBox: "0 0 34 34", fill: "none",
    stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round",
    "aria-hidden": true,
  };
  if (shape === "pin")
    return (
      <svg {...common}>
        <path d="M17 31c6.5-8 9.5-12.6 9.5-17a9.5 9.5 0 0 0-19 0c0 4.4 3 9 9.5 17z" />
        <circle cx="17" cy="13.5" r="3.2" />
      </svg>
    );
  if (shape === "scale")
    return (
      <svg {...common}>
        <path d="M17 5v24M7 29h20" />
        <path d="M4 12h26M4 12l-2.5 6.5h5zM30 12l2.5 6.5h-5z" />
      </svg>
    );
  if (shape === "build")
    return (
      <svg {...common}>
        <rect x="4" y="21" width="8" height="9" />
        <rect x="13" y="14" width="8" height="16" />
        <rect x="22" y="7" width="8" height="23" />
      </svg>
    );
  if (shape === "data")
    return (
      <svg {...common}>
        <path d="M5 5v24h24" />
        <path d="M10 23l6.5-7.5 5 4L29 10" />
      </svg>
    );
  return null;
}

const FOUNDERS = [
  ["Alfonso Perez Soto", "CEO & Founder", "assets/alfonso.png"],
  ["Temi Adeniji", "COO & Founder", "assets/temi.png"],
  ["Inigo Zabala", "AMP Global Partner", "assets/inigo.png"],
];


function AmpShell({ skipIntro }) {
  // ── shared height source (Spec 1 + Spec 3 agree via one dvh probe) ──────
  const viewportRef = useRef(null);

  // ── reduced motion, one read drives pager + matrix ──────────────────────
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // ── dev panel ───────────────────────────────────────────────────────────
  const [devOpen, setDevOpen] = useState(false);
  const [matrix, setMatrix] = useState(MATRIX);
  // Lifted out of the Focus section: the background matrix needs it too.
  const [region, setRegion] = useState(0);
  // Bottom of the focus copy, in viewport px — the map is placed under it.
  const [focusBottom, setFocusBottom] = useState(0);

  const [grad, setGrad] = useState(GRADIENT);
  // Dark is the default, but a device that explicitly asks for light gets it.
  // "no-preference" does not match either query, so it falls through to dark.
  const [dark, setDark] = useState(() =>
    typeof window === "undefined"
      ? true
      : !window.matchMedia("(prefers-color-scheme: light)").matches
  );
  // Once the visitor uses the toggle, their choice outranks the device for the
  // rest of the session — a later OS switch should not yank it back.
  const darkPinned = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => { if (!darkPinned.current) setDark(!mq.matches); };
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const [pageIndex, setPageIndex] = useState(0);
  const [intro, setIntro] = useState(!skipIntro);
  const introDone = useCallback(() => setIntro(false), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nav, setNav] = useState(NAVCFG);
  const [cfade, setCfade] = useState(CONTENT_FADE);
  const [foot, setFoot] = useState(FOOTER);
  const footFrostRef = useRef(null);
  const contentRefs = useRef([]);
  const originRef = useRef({ cx: -9999, cy: -9999, hw: 0, hh: 0 });
  const navRefs = useRef([]);
  const burgerRef = useRef(null);
  const page = PAGES[pageIndex];
  const sections = page.sections;

  const ground = dark ? INK : PAPER;
  const fg = dark ? PAPER : INK;

  // Measured from the rendered footer, then clamped. Everything that depends on
  // the footer's size — the pager's partial lift, the accent gradient's
  // position, the frost's height — reads this one value.
  const [footerH, setFooterH] = useState(0);
  const footerElRef = useRef(null);
  useEffect(() => {
    const el = footerElRef.current;
    if (!el) return;
    const measure = () => {
      const vh = window.innerHeight;
      const natural = el.scrollHeight;
      setFooterH(
        Math.round(
          Math.min(Math.max(natural, (vh * foot.minVh) / 100), (vh * foot.maxVh) / 100)
        )
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [foot.minVh, foot.maxVh, foot.padY, pageIndex]);

  // One gradient per section at its own bottom edge (standard tint), plus ONE
  // for the footer in the accent variant. The footer sits a fraction of a
  // viewport past the last section, hence the fractional position.
  const gradientEntries = useMemo(() => {
    const list = sections.map((s, i) => ({ id: s.id, at: i, footer: false }));
    const vh = typeof window !== "undefined" ? window.innerHeight : 1;
    list.push({
      id: "__footer",
      at: sections.length - 1 + (footerH || 1) / vh,
      footer: true,
    });
    return list;
  }, [sections, footerH]);

  const paging = usePager({
    count: sections.length + 1, // + the footer stop
    reduced,
    viewportRef,
    footerPx: footerH,
  });

  // A page switch remounts the sections, so the fresh DOM children carry no
  // inert attribute until this runs after the render — without it the
  // paged-away sections stay focusable and a focus inside one scrolls the
  // fixed viewport, landing the page on the wrong section.
  useEffect(() => {
    paging.syncInert(paging.activeIndex);
  }, [pageIndex, sections.length, paging.activeIndex, paging.syncInert]);

  // The new page's sections only exist after this commit, so the pager measures
  // them here rather than inside the click that switched pages.
  useEffect(() => {
    paging.remeasure();
  }, [pageIndex, footerH, paging.remeasure]);

  // The viewport is fixed and overflow:hidden, but focus can still scroll it.
  // Anything that moves it gets snapped straight back.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const snap = () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } };
    el.addEventListener("scroll", snap, { passive: true });
    return () => el.removeEventListener("scroll", snap);
  }, []);

  // Mobile: the hamburger is the only nav, so the menu stays available on
  // every section rather than folding away on the first one.

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Pulse origin: the active nav item while the nav is up, the hamburger once
  // it has folded. Sampled after state changes rather than every frame — a
  // per-frame getBoundingClientRect would force layout on top of the canvas loop.
  useEffect(() => {
    const measure = () => {
      const navUp = menuOpen;
      const el = navUp ? navRefs.current[pageIndex] : burgerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      originRef.current = {
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        hw: r.width / 2,
        hh: r.height / 2,
      };
    };
    measure();
    const ids = [120, 400, 800, 1400].map((t) => setTimeout(measure, t));
    window.addEventListener("resize", measure);
    return () => { ids.forEach(clearTimeout); window.removeEventListener("resize", measure); };
  }, [pageIndex, paging.activeIndex, menuOpen]);

  // Cross-fade the section contents against the pager's live progress. Written
  // straight to the DOM inside one rAF — going through React state here would
  // mean a re-render every frame of an 800ms transition.
  useEffect(() => {
    let on = true;
    let lastP = null;
    const tick = () => {
      if (!on) return;
      const p = paging.progressRef.current;
      if (p !== lastP) {
        lastP = p;
        for (let i = 0; i < contentRefs.current.length; i++) {
          const el = contentRefs.current[i];
          if (!el) continue;
          const d = Math.abs(p - i);
          if (!cfade.enabled) {
            el.style.opacity = "1";
            el.style.transform = "none";
            continue;
          }
          const k = Math.pow(Math.max(0, 1 - d), cfade.sharpness);
          el.style.opacity = String(cfade.floor + (1 - cfade.floor) * k);
          // drift the opposite way to travel, so content feels like it lags
          el.style.transform = `translateY(${(p - i) * cfade.lift}px)`;
        }
      }
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => { on = false; cancelAnimationFrame(id); };
  }, [paging.progressRef, cfade]);

  // Footer frost. Ramps as the footer slides in and covers exactly the part of
  // the viewport the lingering section still occupies — never the footer itself.
  useEffect(() => {
    let on = true;
    let last = null;
    const vh = window.innerHeight || 1;
    const footerStop = sections.length - 1 + (footerH || 1) / vh;
    const lastSection = sections.length - 1;
    const tick = () => {
      if (!on) return;
      const p = paging.progressRef.current;
      if (p !== last) {
        last = p;
        const el = footFrostRef.current;
        if (el) {
          const span = footerStop - lastSection || 1;
          const t = Math.max(0, Math.min(1, (p - lastSection) / span));
          const revealed = t * footerH;
          el.style.height = `calc(100% - ${revealed}px)`;
          el.style.opacity = String(t);
          el.style.backdropFilter = `blur(${foot.frostBlur * t}px)`;
          el.style.webkitBackdropFilter = `blur(${foot.frostBlur * t}px)`;
          el.style.pointerEvents = t > 0.9 ? "auto" : "none";
        }
      }
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => { on = false; cancelAnimationFrame(id); };
  }, [paging.progressRef, sections.length, footerH, foot.frostBlur]);

  // Changing page resets to its first section. Pages have different section
  // counts, so landing on a stale index would otherwise scroll past the end.
  // Changing page resets to its first section. Pages have different section
  // counts, so landing on a stale index would otherwise scroll past the end.
  const goToPage = (i) => {
    if (i === pageIndex) {
      paging.goTo(0);
      return;
    }
    setPageIndex(i);
    paging.reset();
  };

  return (
    <div
      ref={viewportRef}
      style={{
        position: "fixed",
        inset: 0,
        height: "100dvh",
        overflow: "hidden",
        touchAction: "none",
        background: ground,
        fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
        color: fg,
        transition: "background 0.4s ease, color 0.4s ease",
      }}
    >
      {/* ── Spec 4: gradients, fixed, BELOW the matrix ──────────────────── */}
      <GradientLayer progressRef={paging.progressRef} dark={dark} cfg={grad} entries={gradientEntries} />

      {/* ── Spec 3: matrix, FIXED above the gradients ───────────────────── */}
      <MatrixLayer
        cfg={matrix}
        reduced={reduced}
        dark={dark}
        nav={nav}
        originRef={originRef}
        paused={menuOpen}
        region={REGIONS[region]}
        regionOn={sections[paging.activeIndex]?.kind === "focus"}
        regionTop={focusBottom}
      />

      {/* ── Spec 5: nav. Visible on a page's FIRST section; folds into the
          hamburger on any section after it. This is the real driver — the
          pager's section index, not a manual trigger. ─────────────────────── */}
      {intro && <IntroLogo dark={dark} onDone={introDone} />}

      <NavHeader
        pages={PAGES}
        pageIndex={pageIndex}
        onPage={(i) => { goToPage(i); setMenuOpen(false); }}
        folded={paging.activeIndex > 0}
        open={menuOpen}
        onToggle={() => setMenuOpen((o) => !o)}
        cfg={nav}
        fg={fg}
        navRefs={navRefs}
        burgerRef={burgerRef}
        dark={dark}
        logoHidden={intro}
        onDark={() => { darkPinned.current = true; setDark((d) => !d); }}
      />

      <MobileMenu
        open={menuOpen}
        pages={PAGES}
        pageIndex={pageIndex}
        onPage={(i) => { goToPage(i); setMenuOpen(false); }}
        dark={dark}
        fg={fg}
        cfg={nav}
        navRefs={navRefs}
        onDark={() => { darkPinned.current = true; setDark((d) => !d); }}
      />

      {/* Footer frost — demotes the section still showing above the footer.
          Sits above the sections but below the nav frost and header. Its height
          shrinks as the footer is revealed, so it never covers the footer. */}
      <div
        ref={footFrostRef}
        aria-hidden
        onClick={() => paging.goTo(sections.length)}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "100%",
          zIndex: 15,
          opacity: 0,
          pointerEvents: "none",
          background: dark
            ? `rgba(23,19,15,${foot.frostTint})`
            : `rgba(250,248,245,${foot.frostTint})`,
        }}
      />

      {/* ── Spec 5 item 4: frost. Above the sections, below the header, so the
          nav stays sharp while the page behind it is pushed back. ────────── */}
      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 20,
          backdropFilter: menuOpen ? `blur(${nav.blur}px)` : "blur(0px)",
          WebkitBackdropFilter: menuOpen ? `blur(${nav.blur}px)` : "blur(0px)",
          background: dark
            ? `rgba(23,19,15,${menuOpen ? nav.frost : 0})`
            : `rgba(250,248,245,${menuOpen ? nav.frost : 0})`,
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? "auto" : "none",
          transition:
            `backdrop-filter ${nav.frostMs}ms ${EASINGS[nav.frostEase]}, ` +
            `background ${nav.frostMs}ms ${EASINGS[nav.frostEase]}, ` +
            `opacity ${nav.frostMs}ms ${EASINGS[nav.frostEase]}`,
        }}
      />

      {/* ── Spec 1: paged container, sections slide over the matrix ──────── */}
      <div
        ref={paging.containerRef}
        style={{
          position: "relative",
          zIndex: 10,
          willChange: "transform",
          paddingRight: 22,
        }}
      >
        {sections.map((s, i) => (
          <Section
            key={`${page.id}-${s.id}`}
            kind={s.kind}
            dark={dark}
            live={paging.activeIndex === i}
            region={region}
            onRegion={setRegion}
            onFocusBounds={setFocusBottom}
            onGo={(id) => goToPage(PAGES.findIndex((p) => p.id === id))}
            innerRef={(el) => (contentRefs.current[i] = el)}
          />
        ))}
        <SiteFooter dark={dark} innerRef={footerElRef} padY={foot.padY} pages={PAGES} onPage={goToPage} />
      </div>

      {/* ── section indicator: bars sit inside 30px tap targets ─────────── */}
      <nav
        aria-label="Section navigation"
        style={{
          position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 0, zIndex: 30,
        }}
      >
        {sections.map((s, i) => (
          <button
            key={s.id}
            aria-label={`Go to ${s.id}`}
            aria-current={paging.activeIndex === i}
            onClick={() => paging.goTo(i)}
            style={{
              width: 30, height: 23, display: "grid", placeItems: "center",
              background: "none", border: 0, padding: 0, cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "block",
                width: paging.activeIndex === i ? 16 : 10,
                height: paging.activeIndex === i ? 3 : 2,
                borderRadius: 1.5,
                background: paging.activeIndex === i ? ACCENT : `${fg}55`,
                transition: HOVER_T("background", "width", "height"),
              }}
            />
          </button>
        ))}
        <button
          aria-label="Go to footer"
          aria-current={paging.activeIndex === sections.length}
          onClick={() => paging.goTo(sections.length)}
          style={{
            width: 30, height: 23, display: "grid", placeItems: "center",
            background: "none", border: 0, padding: 0, cursor: "pointer",
          }}
        >
          <span
            style={{
              display: "block", width: 5, height: 5, borderRadius: "50%",
              background: paging.activeIndex === sections.length ? ACCENT : `${fg}55`,
              transition: HOVER_T("background"),
            }}
          />
        </button>
      </nav>

    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Spec 1 — pager (inlined; mirrors useSectionPaging, scoped to this shell).
 * ──────────────────────────────────────────────────────────────────────── */
function usePager({ count, reduced, viewportRef, footerPx = 0 }) {
  const containerRef = useRef(null);
  const index = useRef(0);
  const offset = useRef(0);
  const animating = useRef(false);
  const rafId = useRef(null);
  const sectionH = useRef(0);
  const cooldownUntil = useRef(0);
  const samples = useRef([]);
  const prevWheelT = useRef(-1e9);
  const dragging = useRef(false);
  const tStartY = useRef(0);
  const tStartX = useRef(0);
  const axis = useRef(null);
  const tStartOff = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const vel = useRef(0);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const progressRef = useRef(0);
  const footerRef = useRef(footerPx);
  footerRef.current = footerPx;
  const [activeIndex, setActiveIndex] = useState(0);

  const setY = (y) => {
    if (containerRef.current)
      containerRef.current.style.transform = `translateY(${y}px)`;
    // live scroll position in viewport units, for layers that must track the
    // transition frame-by-frame (Spec 4 gradients) without a React re-render
    progressRef.current = sectionH.current ? -y / sectionH.current : 0;
  };

  const syncInert = useCallback((activeIdx) => {
    const kids = containerRef.current?.children;
    if (!kids) return;
    Array.from(kids).forEach((el, i) => {
      if (i === activeIdx) el.removeAttribute("inert");
      else el.setAttribute("inert", "");
    });
  }, []);

  // Every stop is one viewport apart EXCEPT the last one (the footer), which is
  // only the footer's own height away from the section before it.
  const offsetFor = useCallback(
    (i) => {
      const H = sectionH.current;
      const lastSection = count - 2; // index of the section before the footer
      if (footerRef.current <= 0 || i <= lastSection) return -(i * H);
      return -(lastSection * H + footerRef.current);
    },
    [count]
  );

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    sectionH.current = vp.clientHeight;
    offset.current = offsetFor(index.current);
    setY(offset.current);
  }, [viewportRef, offsetFor]);

  const goTo = useCallback(
    (target) => {
      const clamped = Math.max(0, Math.min(target, count - 1));
      if (clamped === index.current || animating.current) return;
      animating.current = true;
      index.current = clamped;
      setActiveIndex(clamped);
      syncInert(clamped);
      const from = offset.current;
      const to = offsetFor(clamped);
      const isRed = reducedRef.current;
      const dur = isRed ? PAGING.reducedDuration : PAGING.duration;
      const ease = isRed ? (t) => t : (t) => 1 - Math.pow(1 - t, PAGING.easePower);
      const start = performance.now();
      cancelAnimationFrame(rafId.current);
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        offset.current = from + (to - from) * ease(t);
        setY(offset.current);
        if (t < 1) rafId.current = requestAnimationFrame(step);
        else {
          offset.current = to;
          setY(to);
          animating.current = false;
        }
      };
      rafId.current = requestAnimationFrame(step);
    },
    [count, syncInert, offsetFor]
  );

  const settleBack = useCallback(() => {
    const to = offsetFor(index.current);
    const from = offset.current;
    const start = performance.now();
    animating.current = true;
    const step = (now) => {
      const t = Math.min(1, (now - start) / 240);
      offset.current = from + (to - from) * (1 - Math.pow(1 - t, 2.4));
      setY(offset.current);
      if (t < 1) requestAnimationFrame(step);
      else {
        offset.current = to;
        animating.current = false;
      }
    };
    requestAnimationFrame(step);
  }, [offsetFor]);

  useEffect(() => {
    measure();
    syncInert(0);

    const onWheel = (e) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= sectionH.current;
      const abs = Math.abs(dy);
      if (abs < 2) return;

      const now = Date.now();

      // A quiet gap means a new, separate gesture — start a fresh sample window
      // so the previous gesture's magnitudes don't skew this one's averages.
      if (now - prevWheelT.current > WHEEL.gestureReset) {
        samples.current = [];
      }
      prevWheelT.current = now;

      // Sample every event, including those swallowed during the lockout: the
      // averages must know how the stream is behaving when the lockout lifts.
      samples.current.push(abs);
      if (samples.current.length > WHEEL.sampleCap) samples.current.shift();

      // Lockout: transition plays in full, then breakAfter of swallowed input.
      if (animating.current || now < cooldownUntil.current) return;

      // Acceleration is the only filter, as in fullPage.js. A momentum tail is
      // decelerating by definition, so its recent average has fallen below its
      // longer-run average and it stays swallowed.
      //
      // A second "peak ratio" gate was tried and REMOVED: momentum arriving
      // after the transition keeps refreshing prevWheelT, so gestureReset never
      // fires and the previous gesture's peak persists. The next swipe was then
      // blocked until it ramped back to 80% of that stale peak — a real,
      // felt delay. The suite passes 9/9 without it, so it bought nothing.
      if (!isAccelerating(samples.current)) return;

      goTo(index.current + (dy > 0 ? 1 : -1));
      cooldownUntil.current = now + PAGING.duration + PAGING.breakAfter;
    };

    const onTS = (e) => {
      dragging.current = true;
      const y = e.touches[0].clientY;
      axis.current = null;
      tStartX.current = e.touches[0].clientX;
      tStartY.current = y;
      lastY.current = y;
      lastT.current = performance.now();
      tStartOff.current = offset.current;
      vel.current = 0;
    };
    const onTM = (e) => {
      if (!dragging.current || animating.current) return;
      const y = e.touches[0].clientY;
      // Lock the gesture to one axis on its first meaningful movement. Anything
      // horizontal belongs to a carousel, not to the pager.
      if (axis.current === null) {
        const adx = Math.abs(e.touches[0].clientX - tStartX.current);
        const ady = Math.abs(y - tStartY.current);
        if (adx < 8 && ady < 8) return;
        axis.current = adx > ady ? "x" : "y";
      }
      if (axis.current === "x") return;
      const now = performance.now();
      const dt = now - lastT.current || 1;
      vel.current = (y - lastY.current) / dt;
      lastY.current = y;
      lastT.current = now;
      let next = tStartOff.current + (y - tStartY.current);
      const min = offsetFor(count - 1);
      if (next > 0) next = next * PAGING.rubberband;
      if (next < min) next = min + (next - min) * PAGING.rubberband;
      offset.current = next;
      setY(next);
    };
    const onTE = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (animating.current) return;
      const moved = offset.current - tStartOff.current;
      const target = index.current + (moved < 0 ? 1 : -1);
      const committed =
        Math.abs(moved) > PAGING.touchDist || Math.abs(vel.current) > PAGING.touchVel;
      // Out-of-range targets must settle, not call goTo: goTo clamps, finds the
      // clamp equals the current index, and returns without animating — which
      // would leave the drag's offset stranded where the finger left it.
      if (committed && target >= 0 && target <= count - 1) goTo(target);
      else settleBack();
    };

    const onKey = (e) => {
      if (animating.current) return;
      const map = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowUp: -1, PageUp: -1 };
      if (e.key in map) {
        e.preventDefault();
        goTo(index.current + map[e.key]);
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(count - 1);
      }
    };

    const onResize = () => measure();

    document.documentElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTS, { passive: true });
    window.addEventListener("touchmove", onTM, { passive: true });
    window.addEventListener("touchend", onTE, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafId.current);
      document.documentElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTS);
      window.removeEventListener("touchmove", onTM);
      window.removeEventListener("touchend", onTE);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [goTo, measure, settleBack, syncInert, count, offsetFor]);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    animating.current = false;
    dragging.current = false;
    index.current = 0;
    offset.current = 0;
    // Re-read the viewport: pages differ in section count and footer height, so
    // a stale sectionH would put every later stop at the wrong offset.
    const vp = viewportRef.current;
    if (vp) sectionH.current = vp.clientHeight;
    setActiveIndex(0);
    setY(0);
    syncInert(0);
    samples.current = [];
    cooldownUntil.current = 0;
  }, [syncInert, viewportRef]);

  return { containerRef, activeIndex, goTo, progressRef, reset, syncInert, remeasure: measure };
}



/* ────────────────────────────────────────────────────────────────────────
 * Placeholder footer. Deliberately NOT a full-height section — reaching it
 * lifts the preceding section by only this height, so that section stays
 * mostly on screen while the footer slides into view beneath it.
 * ──────────────────────────────────────────────────────────────────────── */
function SiteFooter({ dark, innerRef, padY }) {
  const fg = dark ? PAPER : INK;
  const soft = dark ? "#C9C2B8" : "#6B635B";
  const rule = dark ? "#4A423A" : RULE;
  return (
    <footer
      ref={innerRef}
      style={{
        boxSizing: "border-box",
        borderTop: `1px solid ${rule}`,
        padding: `${padY}px 20px`,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        color: fg,
        background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
      }}
    >
      <div style={{ fontSize: UI_SM, color: soft }}>
        Built by <strong style={{ fontWeight: 700 }}>ATIDE</strong> x{" "}
        <strong style={{ fontWeight: 700 }}>B9</strong>
      </div>
      <div style={{ display: "grid", gap: 8, justifyItems: "end", textAlign: "right" }}>
        <img
          src={dark ? LOGO_LIGHT : LOGO_DARK}
          alt="AMP Global"
          style={{ display: "block", width: 128, height: "auto" }}
        />
        <div style={{ fontSize: UI_SM, color: soft, lineHeight: 1.4 }}>
          © 2026 AMP Global.
          <br />
          All rights reserved.
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Spec 5 — the nav header. Three states:
 *   section 1          nav visible, no hamburger
 *   section 2+ closed  hamburger only, nav folded away
 *   section 2+ open    nav back, hamburger is an X, page frosted behind
 * ──────────────────────────────────────────────────────────────────────── */
/* Load intro. Holds the mark full-screen, then FLIPs it onto the nav logo's
   measured rect and hands over. The veil carries the page ground, so nothing
   behind shows until the flight is under way. The intro img is laid out by
   flex centring rather than a percentage transform, leaving `transform` free
   for the flight. */
function IntroLogo({ dark, onDone }) {
  const imgRef = useRef(null);
  // covered → wipe (clip opens left to right) → hold → fly
  const [phase, setPhase] = useState("covered");
  const fly = phase === "fly";

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { const q = setTimeout(onDone, 240); return () => clearTimeout(q); }
    // one frame at the closed clip so the transition has a start value
    const a = requestAnimationFrame(() => setPhase("wipe"));
    const id = setTimeout(() => setPhase("fly"), INTRO.wipe + INTRO.hold);
    return () => { cancelAnimationFrame(a); clearTimeout(id); };
  }, [onDone]);

  useEffect(() => {
    if (!fly) return;
    const img = imgRef.current;
    const target = document.querySelector("[data-nav-logo]");
    if (!img || !target) { onDone(); return; }
    const a = img.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    img.style.transformOrigin = "top left";
    img.style.transition = `transform ${INTRO.fly}ms ${EASINGS["out-quint"]}`;
    img.style.transform =
      `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width})`;
    const id = setTimeout(onDone, INTRO.fly);
    return () => clearTimeout(id);
  }, [fly, onDone]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute", inset: 0,
          background: dark ? INK : PAPER,
          opacity: fly ? 0 : 1,
          transition: `opacity ${Math.round(INTRO.fly * 0.7)}ms ${EASINGS["out-quint"]}`,
        }}
      />
      <img
        ref={imgRef}
        src={dark ? LOGO_LIGHT : LOGO_DARK}
        alt="AMP Global"
        style={{
          position: "relative", display: "block", width: INTRO.size, height: "auto",
          // The mask is dropped for the flight: masking a transform-scaled
          // element resamples it every frame, which is where the residual
          // softness came from. The wipe is over by then, so nothing is lost.
          WebkitMaskImage: fly ? "none" : INTRO.mask,
          maskImage: fly ? "none" : INTRO.mask,
          WebkitMaskSize: "200% 100%",
          maskSize: "200% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: phase === "covered" ? "100% 0" : "0% 0",
          maskPosition: phase === "covered" ? "100% 0" : "0% 0",
          transition: fly
            ? "none"
            : `-webkit-mask-position ${INTRO.wipe}ms ${EASINGS["in-out-quart"]}, ` +
              `mask-position ${INTRO.wipe}ms ${EASINGS["in-out-quart"]}`,
        }}
      />
    </div>
  );
}

function DarkIcon({ dark }) {
  return dark ? (
    <svg width="18" height="18" viewBox="0 0 34 34" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="17" cy="17" r="6.5" fill="currentColor" stroke="none" />
      <path d="M17 2.5v4M17 27.5v4M2.5 17h4M27.5 17h4M6.7 6.7l2.9 2.9M24.4 24.4l2.9 2.9M27.3 6.7l-2.9 2.9M9.6 24.4l-2.9 2.9" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 34 34" aria-hidden>
      <mask id="amp-moon-m">
        <rect width="34" height="34" fill="#000" />
        <circle cx="17" cy="17" r="11" fill="#fff" />
        <circle cx="25.5" cy="12" r="10" fill="#000" />
      </mask>
      <rect width="34" height="34" fill="currentColor" mask="url(#amp-moon-m)" />
    </svg>
  );
}

/* Mobile header: logo + hamburger, on every section. The inline page row is
   gone — there is no width for it and no first-section exception to make. */
function NavHeader({ pages, pageIndex, onPage, folded, open, onToggle, cfg, fg, navRefs, burgerRef, dark, logoHidden, onDark }) {
  const morphEase = EASINGS[cfg.morphEase];
  return (
    <header
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 30,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px 12px 20px", pointerEvents: "none",
      }}
    >
      <img
        src={dark ? LOGO_LIGHT : LOGO_DARK}
        alt="AMP Global"
        data-nav-logo
        onClick={() => onPage(0)}
        style={{
          display: "block", width: 104, height: "auto",
          pointerEvents: "auto", cursor: "pointer",
          visibility: logoHidden ? "hidden" : "visible",
        }}
      />
      <button
        ref={burgerRef}
        onClick={onToggle}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        style={{
          width: 44, height: 44, display: "grid", placeItems: "center",
          background: "none", border: 0, padding: 0, cursor: "pointer",
          pointerEvents: "auto", position: "relative", zIndex: 31,
        }}
      >
        <span style={{ position: "relative", display: "block", width: 24, height: 18 }}>
          {[0, 1, 2].map((b) => {
            const toCentre = open ? (1 - b) * 8 : 0;
            const rot = open ? (b === 0 ? 45 : b === 2 ? -45 : 0) : 0;
            const vanish = open && b === 1;
            return (
              <span
                key={b}
                style={{
                  position: "absolute", left: 0, top: b * 8, height: 2, width: "100%",
                  background: fg, opacity: vanish ? 0 : 1,
                  transformOrigin: "center center",
                  transform: `translateY(${toCentre}px) rotate(${rot}deg)`,
                  transition:
                    `opacity ${cfg.morph}ms ${morphEase}, ` +
                    `transform ${cfg.morph}ms ${morphEase}, background 0.4s ease`,
                }}
              />
            );
          })}
        </span>
      </button>
    </header>
  );
}

/* Full-screen menu panel: the four pages and the light/dark switch. Mounted
   always so the stagger has a start value and the pulse origin can measure the
   active item's rect. */
function MobileMenu({ open, pages, pageIndex, onPage, dark, fg, onDark, cfg, navRefs }) {
  const ease = EASINGS[cfg.openEase];
  return (
    <div
      aria-hidden={!open}
      style={{
        position: "fixed", inset: 0, zIndex: 25,
        display: "grid", gridTemplateRows: "1fr auto",
        padding: "92px 20px 34px",
        boxSizing: "border-box",
        background: dark ? "rgba(23,19,15,0.94)" : "rgba(250,248,245,0.94)",
        backdropFilter: `blur(${cfg.blur}px)`,
        WebkitBackdropFilter: `blur(${cfg.blur}px)`,
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: `opacity ${cfg.frostMs}ms ${ease}, background 0.4s ease`,
      }}
    >
      <nav aria-label="Pages" style={{ display: "grid", alignContent: "start", gap: 2 }}>
        {pages.map((pg, i) => (
          <button
            key={pg.id}
            ref={(el) => (navRefs.current[i] = el)}
            onClick={() => onPage(i)}
            aria-current={pageIndex === i}
            tabIndex={open ? 0 : -1}
            style={{
              justifySelf: "start", background: "none", border: 0,
              padding: "10px 0", minHeight: 48, fontFamily: "inherit",
              cursor: "pointer", textAlign: "left",
              fontSize: "clamp(1.5rem, min(9vw, 5.4vh), 2.5rem)", letterSpacing: "-0.03em",
              fontWeight: pageIndex === i ? 700 : 400,
              color: pageIndex === i ? ACCENT : fg,
              transform: open ? "translateY(0)" : "translateY(20px)",
              opacity: open ? 1 : 0,
              transition:
                `transform ${cfg.openTravel}ms ${ease} ${i * cfg.openStagger}ms, ` +
                `opacity ${cfg.openTravel}ms ${ease} ${i * cfg.openStagger}ms, color 0.3s ease`,
            }}
          >
            {pg.label}
          </button>
        ))}
      </nav>
      <button
        onClick={onDark}
        aria-pressed={dark}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        tabIndex={open ? 0 : -1}
        style={{
          justifySelf: "start", display: "flex", alignItems: "center", gap: 12,
          minHeight: 48, padding: "10px 0", background: "none", border: 0,
          color: fg, fontFamily: "inherit", fontSize: UI, cursor: "pointer",
          opacity: open ? 1 : 0,
          transition: `opacity ${cfg.openTravel}ms ${ease} ${pages.length * cfg.openStagger}ms`,
        }}
      >
        <DarkIcon dark={dark} />
        {dark ? "Light mode" : "Dark mode"}
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Spec 4 — gradient layer.
 *
 * All gradients live on ONE fixed layer, positioned in VIEWPORT space from the
 * pager's live progress. A gradient nested inside a section would be bounded by
 * that section and cut at the seam as it drifts; hoisting them removes the
 * constraint instead of fighting it.
 *
 * Each box is TWO viewports tall and centred on its section's bottom edge, so
 * the ellipse is drawn WHOLE. A one-viewport box ending at the ellipse centre
 * paints only the upper half, leaving a hard flat cut that becomes visible the
 * moment the gradient drifts.
 *
 * Updates run imperatively inside one rAF, writing styles only when progress
 * actually changes — so tracking the transition costs no React re-renders.
 * ──────────────────────────────────────────────────────────────────────── */
function GradientLayer({ progressRef, dark, cfg, entries }) {
  const refs = useRef([]);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    let on = true;
    let lastP = null;
    let lastDark = null;
    let lastSig = null;
    const tick = () => {
      if (!on) return;
      const p = progressRef.current;
      const c = cfgRef.current;
      const d0 = darkRef.current;
      // The config must be part of the dirty check, not just progress: while the
      // pager sits still, progress never changes, so without this a panel slider
      // would never be written to the DOM and the controls would look dead.
      const sig = JSON.stringify(c);
      if (p !== lastP || d0 !== lastDark || sig !== lastSig) {
        lastP = p;
        lastDark = d0;
        lastSig = sig;
        for (let i = 0; i < entries.length; i++) {
          const el = refs.current[i];
          if (!el) continue;
          // entries carry their own position in progress-space, so the footer
          // can sit at a FRACTIONAL index — it is only part of a viewport past
          // the last section, not a whole one.
          const d = p - entries[i].at;
          if (Math.abs(d) > 1.4) { el.style.display = "none"; continue; }
          const g = entries[i].footer ? c.footer : c.standard;
          const opacity = c.fade.enabled
            ? Math.pow(Math.max(0, 1 - Math.abs(d)), c.fade.sharpness)
            : 1;
          if (opacity <= 0.001) { el.style.display = "none"; continue; }
          const driftVh = c.fade.enabled
            ? Math.max(-1, Math.min(1, d)) * c.fade.drift
            : 0;
          el.style.display = "block";
          el.style.top = `${-d * 100}%`;
          el.style.transform = `translateY(${driftVh}vh)`;
          el.style.opacity = String(opacity);
          el.style.background = gradientCss(g, d0);
        }
      }
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => { on = false; cancelAnimationFrame(id); };
  }, [progressRef, entries]);

  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden" }}>
      {entries.map((e, i) => (
        <div
          key={e.id}
          ref={(el) => (refs.current[i] = el)}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "200%",
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
}

function gradientCss(cfg, dark) {
  // "ground" is a tint of the surface: a LIGHT bloom on ink, a warm DARK bloom
  // on paper. The two must be picked for comparable contrast against their own
  // ground — rule tone on paper is ~7x weaker than paper on ink, which made the
  // light-mode gradient effectively invisible at the tuned opacity.
  const rgb =
    cfg.colorMode === "accent"
      ? "249,96,61"
      : cfg.colorMode === "ink"
      ? "23,19,15"
      : dark
      ? "250,248,245" // light bloom on ink
      : "58,51,44"; // warm dark bloom on paper (INK_SOFT)
  const a = cfg.opacity;
  // Box is 2 viewports tall with the ellipse at its centre, so the vertical
  // radius is halved for `height` to still read as a % of ONE viewport.
  const ry = cfg.height / 2;
  return (
    `radial-gradient(ellipse ${cfg.spreadX}% ${ry}% at 50% 50%, ` +
    `rgba(${rgb},${a}) 0%, ` +
    `rgba(${rgb},${(a * 0.45).toFixed(3)}) ${cfg.midStop}%, ` +
    `rgba(${rgb},0) ${cfg.feather}%)`
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Spec 3 — matrix layer, fixed behind the pager.
 * ──────────────────────────────────────────────────────────────────────── */
function MatrixLayer({ cfg, reduced, dark, nav, originRef, paused, region, regionOn, regionTop }) {

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const mouse = useRef({ x: -9999, y: -9999, active: false });
  const grid = useRef({ cols: 0, rows: 0, w: 0, h: 0, dpr: 1 });
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const navRef = useRef(nav);
  navRef.current = nav;
  // Frozen while the menu is frosted: the grid is ambient, nobody reads it
  // through a blur, and backdrop-filter would otherwise force the browser to
  // re-blur a full-viewport canvas on every one of these frames.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // AMP mark rasterised to grid resolution; the sweep samples it per dot.
  const maskRef = useRef(null);
  const logoRef = useRef(null);

  // Layout plan §4 — the active region's projection, rasterised to the grid and
  // cross-faded when the region buttons cycle.
  const regionRef = useRef({ from: null, to: null, start: 0 });
  const regionOnRef = useRef(regionOn);
  regionOnRef.current = regionOn;
  const regionTopRef = useRef(regionTop);
  regionTopRef.current = regionTop;

  const buildRegionMask = useCallback((dots) => {
    const g = grid.current;
    if (!dots || !g.cols || !g.rows) return null;
    const c = cfgRef.current;
    const rc = dots[0].length;
    const rr = dots.length;
    const src = document.createElement("canvas");
    src.width = rc;
    src.height = rr;
    const sctx = src.getContext("2d");
    const id = sctx.createImageData(rc, rr);
    for (let r = 0; r < rr; r++) {
      for (let cc = 0; cc < rc; cc++) {
        id.data[(r * rc + cc) * 4 + 3] = dots[r][cc] === "1" ? 255 : 0;
      }
    }
    sctx.putImageData(id, 0, 0);
    const off = document.createElement("canvas");
    off.width = g.cols;
    off.height = g.rows;
    const octx = off.getContext("2d");
    // The map lives in the space left under the section's copy, measured from
    // the live layout rather than a guessed fraction of the viewport.
    const topRow = ((regionTopRef.current || 0) + c.regionGap) / c.cell;
    const botRow = (g.h - Math.min(64, g.h * 0.06)) / c.cell;
    const availRows = Math.max(10, botRow - topRow);
    let boxW = g.cols * c.regionWidth;
    let boxH = boxW * (rr / rc);
    if (boxH > availRows) { boxH = availRows; boxW = boxH * (rc / rr); }
    // nearest-neighbour: one source cell becomes a block of dots, so the map
    // reads as part of the grid instead of a blurred blob
    octx.imageSmoothingEnabled = false;
    octx.drawImage(src, (g.cols - boxW) / 2, topRow + (availRows - boxH) / 2, boxW, boxH);
    const d = octx.getImageData(0, 0, g.cols, g.rows).data;
    const m = new Float32Array(g.cols * g.rows);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
    return m;
  }, []);

  const setRegionMask = useCallback((mask) => {
    const rs = regionRef.current;
    const now = performance.now();
    const b = Math.min(1, (now - rs.start) / Math.max(1, cfgRef.current.regionFade));
    let snap = null;
    if (rs.from || rs.to) {
      const len = (rs.to || rs.from).length;
      snap = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        snap[i] = (rs.from ? rs.from[i] * (1 - b) : 0) + (rs.to ? rs.to[i] * b : 0);
      }
    }
    regionRef.current = { from: snap, to: mask, start: now };
  }, []);

  const buildMask = useCallback(() => {
    const img = logoRef.current;
    const g = grid.current;
    if (!img || !g.cols || !g.rows) return;
    const c = cfgRef.current;
    const off = document.createElement("canvas");
    off.width = g.cols;
    off.height = g.rows;
    const octx = off.getContext("2d");
    let boxW = g.cols * c.logoWidth;
    let boxH = boxW * (img.naturalHeight / img.naturalWidth);
    const maxH = g.rows * 0.62;
    if (boxH > maxH) { boxH = maxH; boxW = boxH * (img.naturalWidth / img.naturalHeight); }
    octx.drawImage(img, (g.cols - boxW) / 2, (g.rows - boxH) / 2, boxW, boxH);
    const d = octx.getImageData(0, 0, g.cols, g.rows).data;
    const m = new Float32Array(g.cols * g.rows);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
    maskRef.current = m;
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => { logoRef.current = img; buildMask(); };
    img.src = LOGO_DARK;
  }, [buildMask]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const cell = cfgRef.current.cell;
    grid.current = { cols: Math.ceil(w / cell) + 1, rows: Math.ceil(h / cell) + 1, w, h, dpr };
    maskRef.current = null;
    buildMask();
  }, [buildMask]);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [resize]);

  useEffect(() => resize(), [cfg.cell, resize]);
  useEffect(() => buildMask(), [cfg.logoWidth, buildMask]);
  useEffect(() => {
    setRegionMask(regionOn ? buildRegionMask(region?.dots) : null);
  }, [region, regionOn, regionTop, cfg.regionWidth, cfg.regionGap, cfg.cell, buildRegionMask, setRegionMask]);

  // mouse read from the window (canvas is pointer-events:none)
  useEffect(() => {
    const onMove = (e) => {
      mouse.current = { x: e.clientX, y: e.clientY, active: true };
    };
    const onLeave = () => (mouse.current.active = false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let flashStart = performance.now() + 1000;
    let mounted = true;

    const draw = (now) => {
      if (!mounted) return;
      if (pausedRef.current) { requestAnimationFrame(draw); return; }
      const c = cfgRef.current;
      const nv = navRef.current;
      const g = grid.current;
      const { dpr } = g;
      // dot colour follows the ground: ink dots on paper, paper dots on ink
      const [r, gg, b] = darkRef.current ? [250, 248, 245] : [23, 19, 15];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, g.w, g.h);

      // reduced motion: suppress the sweep, keep grid + cursor. The focus
      // section belongs to the region map, so the logo sweep sits out.
      const sweepOn = !reducedRef.current && !regionOnRef.current;
      let bandX = null;
      let flashPhase = 0;
      if (sweepOn) {
        const cycle = (c.flashInterval + c.sweepDuration) * 1000;
        const t = (now - flashStart) % cycle;
        if (t < c.sweepDuration * 1000) {
          flashPhase = t / (c.sweepDuration * 1000);
          bandX = -c.bandWidth + flashPhase * (g.w + c.bandWidth * 2);
        }
      }

      const mx = mouse.current.x;
      const my = mouse.current.y;
      const cursorOn = mouse.current.active;
      const cr = c.cursorRadius;
      const cr2 = cr * cr;

      // Spec 5 item 5 — a ring leaving the active nav item's FRAME
      const o = originRef?.current;
      const usePulse = nv?.pulseOn && o && o.cx > -9000 && !reducedRef.current;
      let ringR = 0, ringAmp = 0;
      if (usePulse) {
        const t = (now % nv.pulsePeriod) / nv.pulsePeriod;
        ringR = t * nv.pulseMax;
        ringAmp = Math.pow(1 - t, 1.6);
      }

      const LEVELS = 16;
      const buckets = [];
      for (let i = 0; i < LEVELS; i++) buckets.push([]);

      const mask = maskRef.current;
      const rs = regionRef.current;
      const rBlend = Math.min(1, (now - rs.start) / Math.max(1, c.regionFade));
      const rOn = !!(rs.from || rs.to);
      for (let row = 0; row < g.rows; row++) {
        const y = row * c.cell;
        const rowOff = row * g.cols;
        for (let col = 0; col < g.cols; col++) {
          const x = col * c.cell;
          let opacity = c.baseOpacity;
          let radius = c.dot;
          let ci = 0;
          if (cursorOn) {
            const dx = x - mx;
            const dy = y - my;
            const d2 = dx * dx + dy * dy;
            if (d2 < cr2) {
              ci = Math.pow(1 - Math.sqrt(d2) / cr, c.cursorFalloff);
              opacity += ci * c.cursorStrength;
              radius = c.dot * (1 + ci * (c.dotGrow - 1));
            }
          }
          if (usePulse && ringAmp > 0.002) {
            // Distance to the button's rounded-rect FRAME, not its centre, so
            // the ring traces the button outline as it expands.
            let dist;
            if (nv.pulseShape === "circle") {
              const px = x - o.cx, py = y - o.cy;
              dist = Math.sqrt(px * px + py * py);
            } else {
              const rr = Math.min(nv.pulseCorner, o.hw + nv.pulsePadX, o.hh + nv.pulsePadY);
              const qx = Math.abs(x - o.cx) - (o.hw + nv.pulsePadX - rr);
              const qy = Math.abs(y - o.cy) - (o.hh + nv.pulsePadY - rr);
              const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
              dist = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
            }
            const band = Math.abs(dist - ringR);
            if (band < nv.pulseWidth) {
              const pi = Math.pow(1 - band / nv.pulseWidth, nv.pulseFalloff) * ringAmp;
              opacity += pi * nv.pulseStrength;
              radius = Math.max(radius, c.dot * (1 + pi * (nv.pulseGrow - 1)));
            }
          }

          if (rOn) {
            const rv =
              (rs.from ? rs.from[rowOff + col] * (1 - rBlend) : 0) +
              (rs.to ? rs.to[rowOff + col] * rBlend : 0);
            if (rv > 0.01) {
              opacity += rv * c.regionOpacity;
              radius = Math.max(radius, c.dot * (1 + rv * (c.regionGrow - 1)));
            }
          }

          if (bandX !== null) {
            const bd = Math.abs(x - bandX);
            if (bd < c.bandWidth) {
              let bi = 1 - bd / c.bandWidth;
              bi *= bi;
              const env = Math.sin(flashPhase * Math.PI);
              const mk = mask ? mask[rowOff + col] : 0;
              const amp = bi * env;
              let flash = amp * (c.flashOpacity * c.logoResidual + c.logoOpacity * mk);
              if (ci > 0) flash *= 1 + ci * (c.flashBoostUnderCursor - 1);
              opacity += flash;
              if (mk > 0.2) {
                radius = Math.max(radius, c.dot * (1 + amp * mk * (c.logoGrow - 1)));
              }
            }
          }
          if (opacity <= 0.008) continue;
          if (opacity > 1) opacity = 1;
          buckets[(opacity * (LEVELS - 1)) | 0].push(x, y, radius);
        }
      }

      ctx.fillStyle = `rgb(${r},${gg},${b})`;
      for (let level = 1; level < LEVELS; level++) {
        const arr = buckets[level];
        if (arr.length === 0) continue;
        ctx.globalAlpha = level / (LEVELS - 1);
        ctx.beginPath();
        for (let i = 0; i < arr.length; i += 3) {
          ctx.moveTo(arr[i] + arr[i + 2], arr[i + 1]);
          ctx.arc(arr[i], arr[i + 1], arr[i + 2], 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    };
    const id = requestAnimationFrame(draw);
    return () => {
      mounted = false;
      cancelAnimationFrame(id);
    };
  }, [originRef]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Sections — the real AMP site content, clamp-sized to fit one viewport
 * (Spec 2). Each section is height:100dvh and centres content that never
 * overflows; the interactive cycles (pillars, edges, regions) live inside
 * their own section so paging never resets an unrelated one.
 * ──────────────────────────────────────────────────────────────────────── */
/* Region grids rasterised from Natural Earth (world-atlas 110m) geometry:
   d3.geoMercator fitted to each region's countries, 40 x 34 sample grid. */
const REGIONS = [
  { name: "Africa", dots: ["0000000000000111100000000000000000000000","0000000000111111100000000000000000000000","0000000001111111111000100000000000000000","0000000011111111111111111111000000000000","0000000011111111111111111111000000000000","0000000111111111111111111110000000000000","0000001111111111111111111111000000000000","0000011111111111111111111111100000000000","0000011111111111111111111111100000000000","0000001111111111111111111111100000000000","0000011111111111111111111111110000000000","0000011111111111111111111111111000000000","0000001111111111111111111111111000000000","0000000111111111111111111111111111100000","0000000111111111111111111111111111000000","0000000001010001111111111111111111000000","0000000000000000011111111111111110000000","0000000000000000011111111111111100000000","0000000000000000011111111111111000000000","0000000000000000001111111111110000000000","0000000000000000001111111111110000000000","0000000000000000001111111111110000000000","0000000000000000000111111111110000000000","0000000000000000001111111111110000100000","0000000000000000001111111111110001100000","0000000000000000001111111111100011000000","0000000000000000001111111111000011000000","0000000000000000000111111111000011000000","0000000000000000000111111111000010000000","0000000000000000000111111110000000000000","0000000000000000000011111110000000000000","0000000000000000000011111100000000000000","0000000000000000000001111000000000000000","0000000000000000000001110000000000000000"] },
  { name: "MENA", dots: ["0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000001111100000000000000111100000000","0000011111111100000000000000111110000000","0000111111111110000000000001111110000000","0000111111111111100111100001111111000000","0000111111111111111111111111111111000000","0001111111111111111111111111111111000000","0011011111111111111111111110111111100000","0110001111111111111111111110111111110100","1100000011111110101111111110011111111111","0000000001111000000011000000011111111111","0000000000010000000000000000001111111110","0000000000000000000000000000000111111100","0000000000000000000000000000000111110000","0000000000000000000000000000000111000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000","0000000000000000000000000000000000000000"] },
  { name: "India & South Asia", dots: ["0000000000001000000000000000000000000000","0000000110111011000000000000000000000000","0000001111111111100000000000000000000000","0000011111111111111000000000000000000000","0001111111111111111100000000000000000000","0001111111111111111100000000000000000000","0001111111111111111100000000000000000000","0001111111111111111100000000000000000000","0000111111111111111100000000000000000000","0001111111111111111111100000000000000000","0001111111111111111111111000000000000000","0000111111111111111111111100000001110000","0000011111111111111111111111101111111000","0000011111111111111111111111111111100000","0000111111111111111111111111111111100000","0000000001111111111111111111111111100000","0000000000111111111111111111111111000000","0000000000011111111111111111111010000000","0000000000011111111111111111100010000000","0000000000000011111111111111000000000000","0000000000000011111111111100000000000000","0000000000000011111111111000000000000000","0000000000000011111111110000000000000000","0000000000000001111111100000000000000000","0000000000000001111110000000000000000000","0000000000000000111110000000000000000000","0000000000000000111110000000000000000000","0000000000000000111110000000000000000000","0000000000000000011110000000000000000000","0000000000000000011110000000000000000000","0000000000000000001100000000000000000000","0000000000000000001001000000000000000000","0000000000000000000001100000000000000000","0000000000000000000001100000000000000000"] },
  { name: "Latin America", dots: ["0000001101000000000000000000000000000000","0000000011110000000000000000000000000000","0000000001110000000000000000000000000000","0000000000111000000000000000000000000000","0000000000111001000100000000000000000000","0000000000011111000101000000000000000000","0000000000000011110000000000000000000000","0000000000000000100001000000000000000000","0000000000000000010010111000000000000000","0000000000000000000011111100000000000000","0000000000000000000111111110000000000000","0000000000000000000111111111000000000000","0000000000000000000111111111111000000000","0000000000000000001111111111111111000000","0000000000000000000111111111111111000000","0000000000000000000011111111111110000000","0000000000000000000011111111111100000000","0000000000000000000000111111111100000000","0000000000000000000000111111111100000000","0000000000000000000000111111111000000000","0000000000000000000000111111100000000000","0000000000000000000000111111100000000000","0000000000000000000001111111000000000000","0000000000000000000001111111000000000000","0000000000000000000001111100000000000000","0000000000000000000001111100000000000000","0000000000000000000001111000000000000000","0000000000000000000001110000000000000000","0000000000000000000011100000000000000000","0000000000000000000011100000000000000000","0000000000000000000011100000000000000000","0000000000000000000011000000000000000000","0000000000000000000011100000000000000000","0000000000000000000001110000000000000000"] }
];

function Section({ kind, dark, live, innerRef, onGo, region, onRegion, onFocusBounds }) {
  const t = {
    fg: dark ? PAPER : INK,
    soft: dark ? "#C9C2B8" : "#6B635B",
    body: dark ? "#D6CFC5" : INK_SOFT,
    rule: dark ? "#4A423A" : RULE,
    // Opaque in both modes. Dark is a neutral grey rather than a tint of the
    // warm ink ground, which read as reddish against the paper-toned palette.
    card: dark ? "#242426" : "#FFFFFF",
    // Near-opaque rather than backdrop-filtered: the pager's transform makes a
    // backdrop root, so a blur here can never sample the fixed matrix behind
    // it. A heavy tint lets the sweep read as faint texture instead of dots.
    field: dark ? "rgba(34,28,23,0.9)" : "rgba(255,255,255,0.92)",
    dim: dark ? "#8C8478" : "#8C847A",
    off: dark ? "rgba(255,255,255,0.13)" : "#E4DED4",
    btnBg: dark ? PAPER : INK,
    btnFg: dark ? INK : PAPER,
    // lifts the outline CTA off the matrix without filling it in
    btnFrost: dark ? "rgba(46,39,32,0.72)" : "rgba(255,255,255,0.72)",
    dark,
  };
  return (
    <section
      style={{
        height: "100dvh",
        display: "flex",
        alignItems: "center",
        // Top pad clears the fixed header (~83px at its largest); the bottom pad
        // keeps content off the section's gradient edge. Both are vh-relative so
        // a short viewport spends its height on content, not on padding.
        padding: "clamp(70px, 11vh, 92px) 20px clamp(22px, 4vh, 34px)",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: "100%", maxWidth: 560, margin: "0 auto", willChange: "opacity, transform",
          ...(kind === "focus" ? { alignSelf: "stretch" } : null),
        }}
      >
        {kind === "hero" && <Hero t={t} onGo={onGo} />}
        {kind === "approach" && <Approach t={t} />}
        {kind === "focus" && <Focus t={t} live={live} active={region} onActive={onRegion} onBounds={onFocusBounds} />}
        {kind === "whatWeDo" && <WhatWeDo t={t} live={live} />}
        {kind === "edge" && <Edge t={t} live={live} />}
        {kind === "who" && <Who t={t} />}
        {kind === "team" && <Team t={t} />}
        {kind === "contact" && <ContactStatement t={t} />}
        {kind === "proposal" && <Proposal t={t} />}
      </div>
    </section>
  );
}

const H2 = {
  margin: 0,
  fontSize: "clamp(1.5rem, min(7.4vw, 4vh), 2.1rem)",
  lineHeight: 1.08,
  letterSpacing: "-0.025em",
  fontWeight: 400,
};
const BODY = { margin: 0, fontSize: "1rem", lineHeight: 1.6 };
/* Type scale — every size on the site comes from here. */
const D1 = {
  margin: 0, fontSize: "clamp(2.1rem, min(10.5vw, 5.2vh), 3.3rem)", lineHeight: 1.02,
  letterSpacing: "-0.035em", fontWeight: 400,
};
const H3 = {
  margin: 0, fontSize: "clamp(1.0625rem, min(4.4vw, 2.5vh), 1.3rem)", lineHeight: 1.42,
  letterSpacing: "-0.02em", fontWeight: 500,
};
const SUB = { fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em" };
const LEAD = { margin: 0, fontSize: "clamp(1rem, min(4.2vw, 2.4vh), 1.125rem)", lineHeight: 1.55 };
const LIST = { fontSize: "clamp(1.0625rem, min(4.4vw, 2.5vh), 1.25rem)", letterSpacing: "-0.02em" };
const LIST_CAPS = { fontSize: "1rem", letterSpacing: "0.06em", textTransform: "uppercase" };
const SMALL = "1rem";
const MICRO = "0.875rem";
const UI = 16;
const UI_SM = 16;
/* Soft-cornered, following the logo's rounded strokes. */
const RADIUS = { control: 4, box: 6 };
/* Hover/selection easing, shared by every cyclable option so the three cycles
   move on one curve. out-quint: quick to commit, long to settle. */
const HOVER_MS = 320;
const HOVER_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const HOVER_T = (...props) => props.map((p) => `${p} ${HOVER_MS}ms ${HOVER_EASE}`).join(", ");
/* Pointer feedback is a separate job from a selection change. 320ms is right
   for a selection settling (a region becoming active, a rail bar filling), but
   on a control you sweep past it trails the cursor. Buttons and arrows use the
   faster pair; the curve is shared so the two still feel related. */
const HOVER_FAST_MS = 200;
const HOVER_FAST_T = (...props) => props.map((p) => `${p} ${HOVER_FAST_MS}ms ${HOVER_EASE}`).join(", ");
const TWOCOL = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "clamp(16px, 3vh, 28px)",
  alignItems: "start",
};
const EYEBROW = {
  fontSize: "0.75rem",
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

function Hero({ t, onGo }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ ...TWOCOL, position: "relative" }}>
        <h1
          style={{
            ...D1, textWrap: "balance",
          }}
        >
          Investing In The Future Of{" "}
          <span style={{ fontWeight: 700, letterSpacing: "-0.045em" }}>Global</span> Music Culture
        </h1>
        <div
          style={{
            borderTop: `1px solid ${t.rule}`, paddingTop: "clamp(14px, 2.4vh, 20px)",
            display: "grid", gap: 28, justifyItems: "start",
          }}
        >
          <p style={{ ...LEAD, color: t.body, maxWidth: "none" }}>
            AMP Global is a music investment platform focused on high-growth markets,
            partnering with creators, rights holders, and local ecosystems to build
            long-term value.
          </p>
          <button
            onClick={() => onGo("contact")}
            style={{
              display: "inline-flex", alignItems: "center", padding: "14px 28px",
              border: `1px solid ${ACCENT}`, borderRadius: RADIUS.control,
              background: ACCENT, color: INK,
              transition: HOVER_FAST_T("background", "border-color", "color"),
              fontFamily: "inherit", fontSize: UI, fontWeight: 500,
              whiteSpace: "nowrap", cursor: "pointer",
            }}
          >
            Submit Proposal
          </button>
        </div>
      </div>
    </div>
  );
}

function Approach({ t }) {
  return (
    <div style={TWOCOL}>
      <h2 style={D1}>
        A Long-Term,{" "}
        <span style={{ fontWeight: 700, letterSpacing: "-0.035em" }}>Global</span> Approach To Music IP.
      </h2>
      <div style={{ display: "grid", gap: 18, borderTop: `1px solid ${t.rule}`, paddingTop: "clamp(14px, 2.4vh, 20px)" }}>
        <p style={{ ...BODY, color: t.body, maxWidth: "none" }}>
          AMP Global invests in and develops music rights and music-driven platforms
          across emerging and underserved regions, where culture is growing faster
          than capital.
        </p>
        <p style={{ ...BODY, color: t.body, maxWidth: "none" }}>
          Our approach goes beyond ownership. We partner locally, invest patiently,
          and apply global best practices to support sustainable growth across music
          ecosystems.
        </p>
      </div>
    </div>
  );
}

/* ── Options cycle ──────────────────────────────────────────────────────────
   Layout plan: a section marked with the cycle star advances through its own
   options by itself, and whatever sits beside them follows — a copy block in
   What We Do and Our Edge, the background map projection in Focus Regions.
   One behaviour for all of them:
     - it only runs while that section is the one on screen, so a paged-away
       section is not burning a timer or arriving mid-cycle
     - any pointer or keyboard touch hands control to the user, and it picks
       back up only after they have gone idle
     - one keyboard model: arrows step through the options, wrapping
     - prefers-reduced-motion stops the automatic advance; the options stay
       fully operable by hand */
const CYCLE_MS = 5600;
// Focus Regions reads faster — one word per option, and the map does the talking.
const CYCLE_MS_FAST = 3800;
const CYCLE_RESUME_MS = 9000;

function useOptionCycle(count, { live, value, onChange, interval = CYCLE_MS } = {}) {
  const [internal, setInternal] = useState(0);
  const controlled = typeof value === "number";
  const index = controlled ? value : internal;
  const indexRef = useRef(index);
  indexRef.current = index;

  const [held, setHeld] = useState(false);
  const holdTimer = useRef(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const select = useCallback(
    (i) => {
      const n = ((i % count) + count) % count;
      indexRef.current = n;
      if (onChange) onChange(n);
      if (!controlled) setInternal(n);
    },
    [count, controlled, onChange]
  );

  const hold = useCallback(() => {
    setHeld(true);
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setHeld(false), CYCLE_RESUME_MS);
  }, []);

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const running = !!live && !held && !reduced && count > 1;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => select(indexRef.current + 1), interval);
    return () => clearInterval(id);
  }, [running, interval, select]);

  // spread on the element wrapping the options
  const group = {
    onKeyDown: (e) => {
      const d =
        e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 :
        e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      hold();
      select(indexRef.current + d);
    },
    onPointerDown: hold,
    onMouseEnter: hold,
    onMouseLeave: hold,
  };

  const pick = (i) => () => { hold(); select(i); };
  return { index, select, hold, running, group, pick };
}

/* Focus Regions — layout plan §4. The map is NOT in the section: the region
   cycle drives the projection drawn by the background matrix. */
function Focus({ t, live, active, onActive, onBounds }) {
  const cyc = useOptionCycle(REGIONS.length, { live, value: active, onChange: onActive, interval: CYCLE_MS_FAST });
  const copyRef = useRef(null);
  useEffect(() => {
    const report = () => {
      const el = copyRef.current;
      const sec = el?.closest("section");
      if (!el || !sec || !onBounds) return;
      // measured against the section, so a paged-away section still reports
      // the same value it will have when it is the one on screen
      onBounds(el.getBoundingClientRect().bottom - sec.getBoundingClientRect().top);
    };
    report();
    const ro = new ResizeObserver(report);
    if (copyRef.current) ro.observe(copyRef.current);
    window.addEventListener("resize", report);
    return () => { ro.disconnect(); window.removeEventListener("resize", report); };
  }, [onBounds]);
  return (
    <div style={{ height: "100%", display: "grid", alignContent: "start" }}>
    <div
      ref={copyRef}
      style={{
        display: "grid", gap: "clamp(20px, 5vh, 56px)",
        justifyItems: "center", textAlign: "center",
      }}
    >
      <h2 style={H2}>Focus Regions</h2>
      <div
        style={{
          width: "100%", display: "grid", justifyItems: "center",
          gap: "clamp(14px, 2.6vh, 28px)",
        }}
      >
      <p style={{ ...H3, color: t.body, maxWidth: "none", fontWeight: 400 }}>
        We focus on regions with strong cultural output, expanding audiences, and
        long-term growth potential.
      </p>
      <div
        {...cyc.group}
        style={{
          width: "100%", display: "flex", flexWrap: "wrap",
          justifyContent: "center", alignItems: "baseline",
          gap: "10px 18px",
        }}
      >
        {REGIONS.map((r, i) => (
          <button
            key={r.name}
            onMouseEnter={cyc.pick(i)}
            onFocus={cyc.pick(i)}
            onClick={cyc.pick(i)}
            aria-current={active === i}
            style={{
              padding: 0, background: "none", border: 0, cursor: "pointer",
              fontFamily: "inherit", ...LIST_CAPS,
              fontWeight: active === i ? 600 : 400,
              color: active === i ? t.fg : t.soft,
              transition: HOVER_T("color", "opacity"),
              opacity: active === i ? 1 : 0.7,
            }}
          >
            {r.name}
          </button>
        ))}
      </div>
      </div>
    </div>
    </div>
  );
}

function WhatWeDo({ t, live }) {
  const cyc = useOptionCycle(PILLARS.length, { live });
  const active = cyc.index;
  return (
    <div style={{ display: "grid", gap: "clamp(18px, 4vh, 64px)" }}>
      <h2 style={{ ...H2, textAlign: "center" }}>What We Do</h2>
      <div style={TWOCOL}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "clamp(20px, 4vh, 48px)" }}>
          <p
            style={{
              ...LEAD, color: t.soft,
            }}
          >
            A holistic investment strategy built for long-term value creation.
          </p>
          <div {...cyc.group} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {PILLARS.map(([title], i) => (
              <button
                key={title}
                onMouseEnter={cyc.pick(i)}
                onFocus={cyc.pick(i)}
                onClick={cyc.pick(i)}
                aria-current={active === i}
                style={{
                  padding: "12px 6px", minHeight: 46, textAlign: "center", borderRadius: RADIUS.control,
                  border: `1px solid ${active === i ? ACCENT : t.rule}`,
                  background: active === i ? ACCENT : "transparent",
                  color: active === i ? INK : t.fg,
                  fontFamily: "inherit", fontSize: UI, fontWeight: 500, cursor: "pointer",
                  transition: HOVER_T("background", "border-color", "color"),
                }}
              >
                {title}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            borderTop: `1px solid ${t.rule}`, paddingTop: "clamp(14px, 2.4vh, 20px)",
            minHeight: 0,
            display: "flex", alignItems: "center",
          }}
        >
          <p
            style={{
              ...H3, maxWidth: "none",
            }}
          >
            {PILLARS[active][1]}
          </p>
        </div>
      </div>
    </div>
  );
}

function Edge({ t, live }) {
  const cyc = useOptionCycle(EDGES.length, { live });
  const active = cyc.index;
  return (
    <div style={{ display: "grid", gap: "clamp(18px, 4vh, 64px)" }}>
      <h2 style={{ ...H2, textAlign: "center" }}>Our Edge</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 12, alignItems: "center" }}>
        <ul {...cyc.group} style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
          {EDGES.map(([title, , icon], i) => (
            <li key={title}>
              <button
                onMouseEnter={cyc.pick(i)}
                onFocus={cyc.pick(i)}
                onClick={cyc.pick(i)}
                aria-current={active === i}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "12px 0", background: "none", border: 0, textAlign: "left",
                  cursor: "pointer", fontFamily: "inherit",
                  ...LIST,
                  fontWeight: 500,
                  letterSpacing: active === i ? "-0.008em" : "-0.02em",
                  color: active === i ? ACCENT : t.fg,
                  transition: HOVER_T("color", "letter-spacing", "opacity"),
                  opacity: active === i ? 1 : 0.62,
                }}
              >
                <span
                  style={{
                    flex: "none", display: "grid", placeItems: "center",
                    color: active === i ? ACCENT : t.dim,
                    transform: active === i ? "scale(1)" : "scale(0.86)",
                    transition: HOVER_T("color", "transform", "opacity"),
                  }}
                >
                  <EdgeIcon shape={icon} />
                </span>
                <span>{title}</span>
              </button>
            </li>
          ))}
        </ul>
        <div
          style={{
            borderLeft: `1px solid ${t.rule}`, paddingLeft: 14,
            minHeight: 0,
            alignSelf: "stretch", display: "flex", alignItems: "center",
          }}
        >
          <p
            style={{
              ...H3, maxWidth: "none",
            }}
          >
            {EDGES[active][1]}
          </p>
        </div>
      </div>
    </div>
  );
}

const WHO = [
  ["Artists and creators", "head"],
  ["Catalogue owners and rights holders", "catalogue"],
  ["Independent labels and platforms", "record"],
  ["Strategic partners and investors", "partners"],
];

function WhoIcon({ shape }) {
  const common = { width: 26, height: 26, viewBox: "0 0 34 34", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true };
  if (shape === "head")
    return (
      <svg {...common} strokeLinecap="round">
        <circle cx="17" cy="12" r="7" />
        <path d="M5.5 30c1.8-6.2 5.9-9.2 11.5-9.2s9.7 3 11.5 9.2" />
      </svg>
    );
  if (shape === "curve")
    return (
      <svg {...common} strokeLinecap="round">
        <path d="M2 17c3.2 0 4-11 7.2-11s4 22 7.2 22 4-16.5 7.2-16.5S29 17 32 17" />
      </svg>
    );
  if (shape === "headphones")
    return (
      <svg {...common}>
        <path d="M5.5 21v-4a11.5 11.5 0 0 1 23 0v4" strokeLinecap="round" />
        <rect x="3" y="20" width="6" height="10" rx="3" />
        <rect x="25" y="20" width="6" height="10" rx="3" />
      </svg>
    );
  if (shape === "wave")
    return (
      <svg {...common} strokeLinecap="round">
        <path d="M3 17v0M8 11v12M13 6v22M18 9.5v15M23 13v8M28 15.5v3" />
      </svg>
    );
  if (shape === "mic")
    return (
      <svg {...common}>
        <rect x="12.5" y="3" width="9" height="16" rx="4.5" />
        <path d="M7.5 15.5a9.5 9.5 0 0 0 19 0" strokeLinecap="round" />
        <path d="M17 25v6" strokeLinecap="round" />
      </svg>
    );
  if (shape === "catalogue")
    return (
      <svg {...common}>
        <rect x="4" y="6" width="18" height="22" rx="1.5" />
        <path d="M26 9.5c2 .6 3 1.2 3 2.4V26c0 1.4-1.3 2-3 2.4" strokeLinecap="round" />
        <path d="M9 13h8M9 18h8" strokeLinecap="round" />
      </svg>
    );
  if (shape === "record")
    return (
      <svg {...common}>
        <circle cx="17" cy="17" r="13" />
        <circle cx="17" cy="17" r="6" />
        <circle cx="17" cy="17" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    );
  if (shape === "partners")
    return (
      <svg {...common}>
        <circle cx="12" cy="17" r="9" />
        <circle cx="22" cy="17" r="9" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d={shape} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Who({ t }) {
  return (
    <div style={{ display: "grid", gap: "clamp(18px, 4vh, 64px)" }}>
      <div style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center" }}>
        <h2 style={H2}>Who We Work With</h2>
      </div>
      <div
        style={{
          display: "grid", justifyItems: "center",
          gap: "clamp(14px, 2.6vh, 28px)",
        }}
      >
        <p style={{ ...BODY, color: t.soft }}>We collaborate across the music ecosystem, including:</p>
      <div
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {WHO.map(([label, shape]) => (
          <div
            key={label}
            style={{
              border: `1px solid ${t.rule}`, borderRadius: RADIUS.box,
              background: t.card, padding: "clamp(11px, 1.9vh, 15px)",
              display: "grid", gap: "clamp(9px, 2.2vh, 16px)", alignContent: "start",
              justifyItems: "center", textAlign: "center", color: t.fg,
            }}
          >
            <span style={{ display: "grid", placeItems: "center", color: ACCENT }}>
              <WhoIcon shape={shape} />
            </span>
            <div style={{ ...EYEBROW, fontSize: SMALL, letterSpacing: "0.06em", lineHeight: 1.45, maxWidth: "none" }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

/* Mobile founders carousel. One card per swipe with a peek of the next, so the
   Team page keeps the site's one-section-per-swipe rhythm while holding three
   people. A gesture that locks to the horizontal axis is swallowed here, and
   the vertical pager independently ignores horizontal gestures, so the two
   never fight over the same finger. */
const FounderCard = ({ t, name, role, photo, w }) => (
  <div
    style={{
      boxSizing: "border-box",
      border: `1px solid ${t.rule}`, borderRadius: RADIUS.box,
      background: t.card, padding: "clamp(12px, 1.8vh, 16px)",
      width: w, maxWidth: "100%", minWidth: 0, height: "100%",
      display: "grid", gridTemplateColumns: "minmax(0, 1fr)",
      gap: "clamp(12px, 2vh, 18px)", alignContent: "start",
    }}
  >
    <img
      src={photo}
      alt={name}
      style={{
        width: "100%", aspectRatio: "3 / 4",
        objectFit: "cover", objectPosition: "center top",
        display: "block",
        borderRadius: RADIUS.control,
        background: t.dark ? "rgba(255,255,255,0.05)" : "#EFEAE2",
        border: `1px solid ${t.rule}`,
      }}
    />
    <div>
      <div style={{ ...SUB, letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1.3, minHeight: "2.6em" }}>
        {name}
      </div>
      <div style={{ marginTop: 6, fontSize: SMALL, color: t.soft }}>{role}</div>
    </div>
  </div>
);

function FounderCarousel({ t }) {
  const n = FOUNDERS.length;
  const GAP = 12;
  const [i, setI] = useState(0);
  const [drag, setDrag] = useState(0);
  const [w, setW] = useState(0);
  const [vh, setVh] = useState(0);
  const wrapRef = useRef(null);
  const g = useRef(null);
  // The release decision reads this, not the state: several touchmoves can land
  // inside one render, which would leave `drag` a frame behind on a fast swipe.
  const dragRef = useRef(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setW(el.clientWidth);
    setVh(window.innerHeight);
    const onResize = () => { setVh(window.innerHeight); if (wrapRef.current) setW(wrapRef.current.clientWidth); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Fixed 3:4 portrait, so the card is sized by width only — derived from both
  // the track width and the viewport height so the ratio never has to break.
  // Whole cards only: work out how many fit at a readable minimum, then size
  // them to fill those slots exactly. The portrait stays 3:4, so the card's
  // width is also capped by viewport height. Arrows carry the affordance, so no
  // half-card peek is needed — and the last step always lands a full card.
  const MIN_CARD = 200;
  const track = w || 320;
  const maxCard = Math.min(Math.round(track * 0.78), Math.round((vh || 720) * 0.3));
  const perView = Math.max(1, Math.min(n, Math.floor((track + GAP) / (MIN_CARD + GAP))));
  const slideW = Math.max(150, Math.min(maxCard, Math.floor((track - (perView - 1) * GAP) / perView)));
  const step = slideW + GAP;
  const maxI = Math.max(0, n - perView);
  const at = Math.min(i, maxI);

  const onStart = (e) => {
    const tch = e.touches[0];
    g.current = { x: tch.clientX, y: tch.clientY, axis: null };
    dragRef.current = 0;
    setDrag(0);
  };
  const onMove = (e) => {
    const s = g.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    if (s.axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (s.axis !== "x") return; // vertical: let it through to the pager
    e.stopPropagation();
    let d = dx / step;
    if ((at === 0 && d > 0) || (at === maxI && d < 0)) d *= 0.35; // rubberband the ends
    dragRef.current = d;
    setDrag(d);
  };
  const onEnd = (e) => {
    const s = g.current;
    g.current = null;
    const d = dragRef.current;
    dragRef.current = 0;
    if (!s || s.axis !== "x") { setDrag(0); return; }
    e.stopPropagation();
    if (d < -0.14 && at < maxI) setI(at + 1);
    else if (d > 0.14 && at > 0) setI(at - 1);
    setDrag(0);
  };

  const arrow = (dir) => {
    const to = at + dir;
    const off = to < 0 || to > maxI;
    return (
      <button
        type="button"
        onClick={() => !off && setI(to)}
        disabled={off}
        aria-label={dir < 0 ? "Previous founder" : "Next founder"}
        style={{
          width: 44, height: 44, display: "grid", placeItems: "center",
          border: 0,
          background: "transparent", color: off ? t.rule : ACCENT,
          opacity: off ? 0.45 : 1,
          cursor: off ? "default" : "pointer",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <polyline points={dir < 0 ? "9.5,3 4.5,8 9.5,13" : "6.5,3 11.5,8 6.5,13"} />
        </svg>
      </button>
    );
  };

  return (
    <div style={{ display: "grid", gap: 10, width: "100%", minWidth: 0 }}>
      <div
        ref={wrapRef}
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onTouchCancel={onEnd}
        style={{ overflow: "hidden" }}
      >
        <div
          style={{
            display: "flex",
            gap: GAP,
            transform: `translateX(${(-at + drag) * step}px)`,
            transition: drag ? "none" : `transform 420ms ${EASINGS["out-quint"]}`,
            willChange: "transform",
          }}
        >
          {FOUNDERS.map(([name, role, photo], idx) => (
            <div
              key={name}
              style={{
                flex: `0 0 ${slideW}px`,
                display: "flex",
                opacity: idx >= at && idx < at + perView ? 1 : 0.5,
                transition: `opacity 420ms ${EASINGS["out-quint"]}`,
              }}
            >
              <FounderCard t={t} name={name} role={role} photo={photo} w="100%" />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {arrow(-1)}
        {arrow(1)}
      </div>
    </div>
  );
}

function Team({ t }) {
  return (
    <div style={{ display: "grid", gap: "clamp(18px, 4vh, 64px)" }}>
      <div style={TWOCOL}>
        <h2 style={H2}>Team &amp; Advisors</h2>
        <p
          style={{
            ...BODY, borderTop: `1px solid ${t.rule}`,
            paddingTop: "clamp(14px, 2.4vh, 20px)", color: t.body, maxWidth: "none",
          }}
        >
          A global team with deep experience across music, investment, and emerging markets.
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gap: "clamp(14px, 2.2vh, 22px)",
          alignContent: "start",
        }}
      >
        <div style={{ ...EYEBROW, color: t.soft }}>Founders</div>
        <FounderCarousel t={t} />
      </div>
    </div>
  );
}

function ContactStatement({ t }) {
  return (
    <div style={TWOCOL}>
      <h2
        style={{
          ...D1, maxWidth: "none",
        }}
      >
        Building the Next Chapter of{" "}
        <span style={{ fontWeight: 700, letterSpacing: "-0.04em" }}>Global</span> Music
      </h2>
      <div
        style={{
          borderTop: `1px solid ${t.rule}`, paddingTop: "clamp(14px, 2.4vh, 20px)",
          display: "grid", gap: 24, justifyItems: "start",
        }}
      >
        <p style={{ ...LEAD, color: t.body, maxWidth: "none" }}>
          AMP Global exists to support the long-term growth of music ecosystems
          worldwide, investing patiently, partnering locally, and thinking globally.
        </p>
        <a
          href="mailto:info@ampglobalent.com"
          style={{
            ...SUB, fontWeight: 500, color: t.fg,
            borderBottom: `1px solid ${t.rule}`, paddingBottom: 2, textDecoration: "none",
          }}
        >
          info@ampglobalent.com
        </a>
      </div>
    </div>
  );
}

function Proposal({ t }) {
  const [sent, setSent] = useState(false);
  const field = {
    padding: "clamp(9px, 1.4vh, 13px) 14px", background: t.field, border: `1px solid ${t.rule}`,
    borderRadius: RADIUS.control, fontFamily: "inherit", fontSize: UI, letterSpacing: 0,
    textTransform: "none", color: t.fg,
    width: "100%", boxSizing: "border-box", minWidth: 0, maxWidth: "100%",
  };
  const label = { display: "grid", gap: 8, minWidth: 0, ...EYEBROW, color: t.soft };
  return (
    <div style={TWOCOL}>
      <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <h3 style={H2}>
          Submit Proposal
        </h3>
        <p style={{ ...BODY, color: t.soft, maxWidth: "none" }}>
          Tell us about your proposal and we'll get in touch.
        </p>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); setSent(true); }}
        style={{
          borderTop: `1px solid ${t.rule}`, paddingTop: "clamp(14px, 2.4vh, 20px)",
          display: "grid", gap: "clamp(9px, 1.4vh, 15px)",
        }}
      >
        <label style={label}>
          Name
          <input type="text" name="name" style={field} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "clamp(10px, 1.7vh, 18px)" }}>
          <label style={label}>
            Email
            <input type="email" name="email" style={field} />
          </label>
          <label style={label}>
            Phone
            <input type="tel" name="phone" style={field} />
          </label>
        </div>
        <label style={label}>
          Message
          <textarea name="message" rows={2} style={{ ...field, minHeight: "clamp(48px, 9vh, 88px)", height: "auto", resize: "vertical" }} />
        </label>
        <div
          style={{
            border: `1px dashed ${t.dark ? "#5A5147" : "#CFC7BC"}`, borderRadius: RADIUS.box,
            background: t.field,
            padding: "clamp(10px, 1.6vh, 16px)", display: "grid", gap: 4, textAlign: "center",
          }}
        >
          <div style={{ fontSize: SMALL, fontWeight: 500 }}>Choose file or drag &amp; drop</div>
          <div style={{ fontSize: MICRO, color: t.soft }}>ZIP / MP3 / WAV / PDF / XLSX · max 15MB</div>
        </div>
        <button
          type="submit"
          style={{
            justifySelf: "stretch", padding: "14px 28px", minHeight: 48, background: ACCENT, color: INK,
            border: `1px solid ${ACCENT}`, borderRadius: RADIUS.control,
            fontFamily: "inherit", fontSize: UI,
            fontWeight: 500, whiteSpace: "nowrap", cursor: "pointer",
            transition: HOVER_FAST_T("background", "border-color", "color"),
          }}
        >
          Submit Proposal
        </button>
        {sent && (
          <p style={{ margin: 0, fontSize: SMALL, color: ACCENT }}>
            Thanks — we'll be in touch at the address you provided.
          </p>
        )}
      </form>
    </div>
  );
}

/* ── dev panel (behind toggle) ──────────────────────────────────────────── */
function DevPanel({ matrix, setMatrix, grad, setGrad, nav, setNav, cfade, setCfade, foot, setFoot, reduced, activeIndex, sectionCount }) {
  const set = (k) => (e) => setMatrix((m) => ({ ...m, [k]: parseFloat(e.target.value) }));
  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        bottom: 60,
        zIndex: 40,
        width: 280,
        maxHeight: "calc(100vh - 90px)",
        overflowY: "auto",
        background: "rgba(23,19,15,0.94)",
        color: PAPER,
        border: `1px solid ${RULE}33`,
        padding: 16,
        fontSize: 12,
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>merge · dev</div>
      <div style={{ opacity: 0.6, marginBottom: 12, fontFamily: "ui-monospace, monospace" }}>
        section {activeIndex + 1}/{sectionCount} · reduced-motion{" "}
        {reduced ? "ON" : "off"}
      </div>
      <Row label="cell" v={matrix.cell} min={3} max={20} step={1} on={set("cell")} />
      <Row label="base opacity" v={matrix.baseOpacity} min={0.02} max={0.4} step={0.01} on={set("baseOpacity")} />
      <Row label="cursor radius" v={matrix.cursorRadius} min={20} max={200} step={5} on={set("cursorRadius")} />
      <Row label="cursor strength" v={matrix.cursorStrength} min={0} max={1} step={0.05} on={set("cursorStrength")} />
      <Row label="falloff" v={matrix.cursorFalloff} min={0.5} max={5} step={0.1} on={set("cursorFalloff")} />
      <Row label="dot grow" v={matrix.dotGrow} min={1} max={4} step={0.1} on={set("dotGrow")} />
      <Row label="logo width" v={matrix.logoWidth} min={0.3} max={1} step={0.02} on={set("logoWidth")} />
      <Row label="logo opacity" v={matrix.logoOpacity} min={0.2} max={1} step={0.05} on={set("logoOpacity")} />
      <Row label="band residual" v={matrix.logoResidual} min={0} max={1} step={0.05} on={set("logoResidual")} />
      <Row label="region width" v={matrix.regionWidth} min={0.2} max={0.9} step={0.02} on={set("regionWidth")} />
      <Row label="region gap" v={matrix.regionGap} min={0} max={120} step={4} on={set("regionGap")} />
      <Row label="region opacity" v={matrix.regionOpacity} min={0.1} max={1} step={0.05} on={set("regionOpacity")} />

      <div style={{ fontWeight: 700, margin: "14px 0 6px" }}>spec 4 · gradient</div>
      <Row label="std opacity" v={grad.standard.opacity} min={0} max={1} step={0.02}
        on={(e) => setGrad((g) => ({ ...g, standard: { ...g.standard, opacity: +e.target.value } }))} />
      <Row label="std height" v={grad.standard.height} min={8} max={90} step={1}
        on={(e) => setGrad((g) => ({ ...g, standard: { ...g.standard, height: +e.target.value } }))} />
      <Row label="std spread" v={grad.standard.spreadX} min={40} max={260} step={5}
        on={(e) => setGrad((g) => ({ ...g, standard: { ...g.standard, spreadX: +e.target.value } }))} />
      <Row label="footer opacity" v={grad.footer.opacity} min={0} max={1} step={0.02}
        on={(e) => setGrad((g) => ({ ...g, footer: { ...g.footer, opacity: +e.target.value } }))} />
      <Row label="footer height" v={grad.footer.height} min={8} max={100} step={1}
        on={(e) => setGrad((g) => ({ ...g, footer: { ...g.footer, height: +e.target.value } }))} />
      <Row label="drift" v={grad.fade.drift} min={-80} max={80} step={2}
        on={(e) => setGrad((g) => ({ ...g, fade: { ...g.fade, drift: +e.target.value } }))} />
      <div style={{ fontWeight: 700, margin: "14px 0 6px" }}>footer frost</div>
      <Row label="blur" v={foot.frostBlur} min={0} max={20} step={0.25}
        on={(e) => setFoot((f) => ({ ...f, frostBlur: +e.target.value }))} />
      <Row label="tint" v={foot.frostTint} min={0} max={0.8} step={0.01}
        on={(e) => setFoot((f) => ({ ...f, frostTint: +e.target.value }))} />
      <Row label="footer padding" v={foot.padY} min={8} max={80} step={2}
        on={(e) => setFoot((f) => ({ ...f, padY: +e.target.value }))} />

      <div style={{ fontWeight: 700, margin: "14px 0 6px" }}>content cross-fade</div>
      <Row label="sharpness" v={cfade.sharpness} min={0.5} max={5} step={0.1}
        on={(e) => setCfade((c) => ({ ...c, sharpness: +e.target.value }))} />
      <Row label="lift" v={cfade.lift} min={-80} max={80} step={2}
        on={(e) => setCfade((c) => ({ ...c, lift: +e.target.value }))} />
      <Row label="opacity floor" v={cfade.floor} min={0} max={0.8} step={0.02}
        on={(e) => setCfade((c) => ({ ...c, floor: +e.target.value }))} />

      <div style={{ fontWeight: 700, margin: "14px 0 6px" }}>spec 5 · nav</div>
      <Row label="pulse strength" v={nav.pulseStrength} min={0} max={1} step={0.02}
        on={(e) => setNav((n) => ({ ...n, pulseStrength: +e.target.value }))} />
      <Row label="pulse reach" v={nav.pulseMax} min={80} max={700} step={10}
        on={(e) => setNav((n) => ({ ...n, pulseMax: +e.target.value }))} />
      <Row label="pulse period" v={nav.pulsePeriod} min={600} max={6000} step={100}
        on={(e) => setNav((n) => ({ ...n, pulsePeriod: +e.target.value }))} />
      <Row label="frost blur" v={nav.blur} min={0} max={24} step={0.25}
        on={(e) => setNav((n) => ({ ...n, blur: +e.target.value }))} />
      <Row label="frost tint" v={nav.frost} min={0} max={0.8} step={0.01}
        on={(e) => setNav((n) => ({ ...n, frost: +e.target.value }))} />

      <Row label="sharpness" v={grad.fade.sharpness} min={0.5} max={6} step={0.1}
        on={(e) => setGrad((g) => ({ ...g, fade: { ...g.fade, sharpness: +e.target.value } }))} />
      <p style={{ opacity: 0.5, lineHeight: 1.5, marginTop: 10 }}>
        Regression harness. Matrix stays fixed while sections page over it; sweep
        cuts under reduced-motion. Values default to the locked Spec 3 set.
      </p>
    </div>
  );
}

function Row({ label, v, min, max, step, on }) {
  return (
    <label style={{ display: "block", margin: "6px 0" }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: RULE }}>{v}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={on} style={{ width: "100%", accentColor: ACCENT }} />
    </label>
  );
}

return AmpShell;

})();

function AmpShell() {
  const MQ = "(max-width: 768px)";
  const [mobile, setMobile] = React.useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(MQ).matches
  );
  const [switched, setSwitched] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia(MQ);
    const on = () => { setSwitched(true); setMobile(mq.matches); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const Shell = mobile ? MobileShell : DesktopShell;
  return React.createElement(Shell, { key: mobile ? "m" : "d", skipIntro: switched });
}

module.exports = { AmpShell };
