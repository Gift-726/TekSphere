import { useLayoutEffect } from "react";
import createGlobe from "cobe";
import bodyHtml from "./teksphere-body.html?raw";
import "./teksphere.css";

type Theme = "light" | "dark";
type RGB = [number, number, number];


// Each service label in the hero is wired to a point on the globe.
const SERVICE_POINTS: Record<string, [number, number]> = {
  support: [52, -14],
  network: [26, -32],
  software: [-22, -16],
  security: [54, 38],
  infra: [30, 50],
  building: [-6, 48],
  telephony: [-30, 30],
};
const MARKER_ELEVATION = 0.02;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const CENTER_LON = 14;
// cobe's convention for bringing a longitude to the front of the globe
const PHI_CENTER = Math.PI - (toRad(CENTER_LON) - Math.PI / 2);
const THETA_CENTER = 0.26;

// Mirrors cobe's own marker projection so connector lines land exactly on the dots.
const project = (lat: number, lon: number, phi: number, theta: number) => {
  const r = toRad(lat);
  const a = toRad(lon) - Math.PI;
  const o = Math.cos(r);
  const k = 0.8 + MARKER_ELEVATION;
  const x = -o * Math.cos(a) * k;
  const y = Math.sin(r) * k;
  const z = o * Math.sin(a) * k;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const c = cosP * x + sinP * z;
  const s = sinP * sinT * x + cosT * y - cosP * sinT * z;
  const depth = -sinP * cosT * x + sinT * y + cosP * cosT * z;
  return { x: (c + 1) / 2, y: (-s + 1) / 2, front: depth };
};

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export default function TekSpherePage() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const cleanups: Array<() => void> = [];
    const on = <K extends keyof WindowEventMap>(
      target: Window | Document | HTMLElement,
      type: K | string,
      handler: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    };

    /* ---------------- Theme ---------------- */
    const globeThemeUpdaters: Array<() => void> = [];
    let theme: Theme = "light";

    const applyTheme = (next: Theme) => {
      theme = next;
      root.setAttribute("data-theme", next);
      document.querySelectorAll<HTMLImageElement>(".brand-logo").forEach((img) => {
        img.src = next === "dark" ? "/dark-logo.png" : "/Teksphere_Logo.png";
      });
      globeThemeUpdaters.forEach((fn) => fn());
    };
    applyTheme(theme);

    const themeBtn = document.getElementById("themeBtn");
    if (themeBtn) {
      on(themeBtn, "click", () => {
        const next: Theme = theme === "light" ? "dark" : "light";
        applyTheme(next);
      });
    }

    /* ---------------- Globes ---------------- */
    const globeColors = (): {
      dark: number;
      diffuse: number;
      mapBrightness: number;
      baseColor: RGB;
      markerColor: RGB;
      glowColor: RGB;
    } =>
      root.getAttribute("data-theme") === "dark"
        ? {
            dark: 1,
            diffuse: 1.4,
            mapBrightness: 5.5,
            baseColor: [0.2, 0.28, 0.48],
            markerColor: [0.48, 0.66, 1],
            glowColor: [0.1, 0.16, 0.32],
          }
        : {
            dark: 0,
            diffuse: 1.25,
            mapBrightness: 5,
            baseColor: [0.96, 0.97, 1],
            markerColor: [0.12, 0.36, 0.85],
            glowColor: [0.9, 0.93, 1],
          };

    type GlobeConfig = {
      canvasId: string;
      interactive: boolean;
      speed: number; // steady spin, radians per second
      markers: boolean;
      onFrame?: (phi: number, theta: number, dt: number) => void;
      register?: (api: { focus: (lon: number | null) => void }) => void;
    };

    const initGlobe = ({ canvasId, interactive, speed, markers, onFrame, register }: GlobeConfig) => {
      const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
      if (!canvas) return;

      let globe: ReturnType<typeof createGlobe> | null = null;
      let frame = 0;
      let visible = false;
      let last = 0;
      let phi = PHI_CENTER;
      let theta = THETA_CENTER;
      let thetaTarget = THETA_CENTER;
      let velocity = 0; // radians per second
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      let lastMoveTime = 0;
      let focusPhi: number | null = null;
      const autoSpeed = prefersReducedMotion() ? 0 : speed;
      velocity = autoSpeed;

      const size = () => {
        const width = canvas.offsetWidth || 480;
        const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? 1.5 : 2);
        return { width, height: width, dpr };
      };

      const tick = (now: number) => {
        frame = 0;
        if (!globe || !visible) return;
        const dt = Math.min(last ? now - last : 16, 64) / 1000;
        last = now;

        if (!dragging) {
          if (focusPhi !== null) {
            // turn the shortest way round to face the hovered service
            const diff = Math.atan2(Math.sin(focusPhi - phi), Math.cos(focusPhi - phi));
            const step = diff * (1 - Math.pow(0.02, dt));
            phi += step;
            velocity = step / Math.max(dt, 0.001);
          } else {
            // fling momentum settles back to the steady spin
            velocity += (autoSpeed - velocity) * (1 - Math.pow(0.25, dt));
            phi += velocity * dt;
          }
          thetaTarget += (THETA_CENTER - thetaTarget) * (1 - Math.pow(0.3, dt));
        }
        theta += (thetaTarget - theta) * (1 - Math.pow(0.0005, dt));
        globe.update({ phi, theta });
        onFrame?.(phi, theta, dt * 1000);
        frame = requestAnimationFrame(tick);
      };

      register?.({
        focus: (lon: number | null) => {
          focusPhi = lon === null ? null : Math.PI - (toRad(lon) - Math.PI / 2);
        },
      });

      const start = () => {
        if (!frame && globe && visible) {
          last = 0;
          frame = requestAnimationFrame(tick);
        }
      };
      const stop = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      };

      const create = () => {
        if (globe) return;
        const { width, height, dpr } = size();
        globe = createGlobe(canvas, {
          devicePixelRatio: dpr,
          width,
          height,
          phi,
          theta,
          mapSamples: 16000,
          markerElevation: MARKER_ELEVATION,
          markers: markers ? Object.values(SERVICE_POINTS).map((location) => ({ location, size: 0.035 })) : [],
          ...globeColors(),
        });
        globeThemeUpdaters.push(() => globe?.update(globeColors()));
        canvas.style.opacity = "1";
        start();
      };

      const observer = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting;
          if (visible) {
            create();
            start();
          } else {
            stop();
          }
        },
        { rootMargin: "150px" },
      );
      observer.observe(canvas);

      const resizeObserver = new ResizeObserver(() => {
        if (!globe) return;
        const { width, height } = size();
        globe.update({ width, height });
      });
      resizeObserver.observe(canvas);

      if (interactive) {
        on(canvas, "pointerdown", (event) => {
          const e = event as PointerEvent;
          dragging = true;
          focusPhi = null;
          lastX = e.clientX;
          lastY = e.clientY;
          lastMoveTime = performance.now();
          velocity = 0;
          canvas.classList.add("grabbing");
        });
        on(window, "pointermove", (event) => {
          if (!dragging) return;
          const e = event as PointerEvent;
          const now = performance.now();
          const dx = (e.clientX - lastX) * 0.007;
          phi += dx;
          thetaTarget = Math.max(-0.6, Math.min(0.9, thetaTarget + (e.clientY - lastY) * 0.005));
          const dt = Math.max(now - lastMoveTime, 1) / 1000;
          velocity = velocity * 0.6 + (dx / dt) * 0.4;
          lastX = e.clientX;
          lastY = e.clientY;
          lastMoveTime = now;
        }, { passive: true });
        const end = () => {
          if (!dragging) return;
          dragging = false;
          canvas.classList.remove("grabbing");
          if (performance.now() - lastMoveTime > 80) velocity = 0; // held still: no fling
          velocity = Math.max(-8, Math.min(8, velocity));
        };
        on(window, "pointerup", end);
        on(window, "pointercancel", end);
      }

      cleanups.push(() => {
        observer.disconnect();
        resizeObserver.disconnect();
        stop();
        globe?.destroy();
        globe = null;
      });
    };

    /* ---------------- Hero connectors: service labels -> points on the globe ---------------- */
    const stage = document.getElementById("heroStage");
    const connectorSvg = document.getElementById("heroConnectors");
    const heroCanvas = document.getElementById("teksphereGlobe");
    const labels = Array.from(document.querySelectorAll<HTMLElement>(".hero-label"));
    const svgNS = "http://www.w3.org/2000/svg";
    type Connector = {
      id: string;
      label: HTMLElement;
      group: SVGGElement;
      path: SVGPathElement;
      dot: SVGCircleElement;
      side: "left" | "right";
      ax: number;
      ay: number;
      alpha: number;
    };
    const connectors: Connector[] = [];
    let globeBox = { x: 0, y: 0, size: 0 };
    let connectorsOn = false;

    if (stage && connectorSvg && heroCanvas) {
      labels.forEach((label) => {
        const id = label.dataset.svc || "";
        const group = document.createElementNS(svgNS, "g");
        const path = document.createElementNS(svgNS, "path");
        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("r", "4");
        group.append(path, dot);
        connectorSvg.append(group);
        const side = label.classList.contains("left") ? "left" : "right";
        connectors.push({ id, label, group, path, dot, side, ax: 0, ay: 0, alpha: 0 });
        on(label, "mouseenter", () => group.classList.add("hot"));
        on(label, "mouseleave", () => group.classList.remove("hot"));
      });

      // Place labels just outside the sphere's silhouette at their height, then cache anchor points.
      const layout = () => {
        connectorsOn = window.innerWidth > 960;
        if (!connectorsOn) {
          labels.forEach((l) => {
            l.style.left = "";
            l.style.right = "";
          });
          return;
        }
        const s = stage.getBoundingClientRect();
        const c = heroCanvas.getBoundingClientRect();
        globeBox = { x: c.left - s.left, y: c.top - s.top, size: c.width };
        const r = c.width / 2;
        const cx = globeBox.x + r;
        const cy = globeBox.y + r;
        connectors.forEach((con, i) => {
          const top = (parseFloat(con.label.style.top) / 100) * s.height;
          const dy = Math.min(Math.abs(top - cy), r * 0.98);
          const half = Math.sqrt(r * r - dy * dy);
          const gap = 40 + (i % 2) * 22;
          if (con.side === "left") {
            con.label.style.right = `${s.width - (cx - half - gap)}px`;
            con.label.style.left = "auto";
          } else {
            con.label.style.left = `${cx + half + gap}px`;
            con.label.style.right = "auto";
          }
        });
        // anchors after positioning
        connectors.forEach((con) => {
          const b = con.label.getBoundingClientRect();
          con.ax = (con.side === "left" ? b.right : b.left) - s.left;
          con.ay = b.top + b.height / 2 - s.top;
        });
        connectorSvg.setAttribute("viewBox", `0 0 ${s.width} ${s.height}`);
      };
      layout();
      const ro = new ResizeObserver(layout);
      ro.observe(stage);
      cleanups.push(() => ro.disconnect());

      const drawConnectors = (phi: number, theta: number, dt: number) => {
        if (!connectorsOn) return;
        const ease = 1 - Math.pow(0.002, dt / 1000);
        connectors.forEach((con) => {
          const point = SERVICE_POINTS[con.id];
          if (!point) return;
          const p = project(point[0], point[1], phi, theta);
          const mx = globeBox.x + p.x * globeBox.size;
          const my = globeBox.y + p.y * globeBox.size;
          // show a line only while its dot faces us and sits on the label's side of the globe
          const nearSide = con.side === "left" ? p.x < 0.58 : p.x > 0.42;
          const target = p.front > 0.08 && nearSide ? 1 : 0;
          con.alpha += (target - con.alpha) * ease;
          const dir = con.side === "left" ? 1 : -1;
          const bend = Math.min(60, Math.abs(mx - con.ax) * 0.5);
          con.path.setAttribute(
            "d",
            `M${con.ax.toFixed(1)},${con.ay.toFixed(1)} C${(con.ax + dir * bend).toFixed(1)},${con.ay.toFixed(1)} ${(mx - dir * 18).toFixed(1)},${my.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`,
          );
          con.dot.setAttribute("cx", mx.toFixed(1));
          con.dot.setAttribute("cy", my.toFixed(1));
          con.group.style.opacity = con.alpha.toFixed(3);
          con.label.style.setProperty("--reach", con.alpha.toFixed(3));
        });
      };

      let heroGlobe: { focus: (lon: number | null) => void } | null = null;
      initGlobe({
        canvasId: "teksphereGlobe",
        interactive: true,
        speed: 0.22,
        markers: true,
        onFrame: drawConnectors,
        register: (api) => (heroGlobe = api),
      });
      // Hovering a service turns the globe to face it.
      connectors.forEach((con) => {
        const point = SERVICE_POINTS[con.id];
        if (!point) return;
        on(con.label, "mouseenter", () => heroGlobe?.focus(point[1]));
        on(con.label, "mouseleave", () => heroGlobe?.focus(null));
        on(con.label, "focus", () => heroGlobe?.focus(point[1]));
        on(con.label, "blur", () => heroGlobe?.focus(null));
      });
    }
    initGlobe({ canvasId: "teksphereGlobeInfra", interactive: true, speed: 0.15, markers: false });

    /* ---------------- Scroll-linked UI (one rAF-throttled handler) ---------------- */
    const nav = document.querySelector<HTMLElement>(".nav");
    const procLine = document.getElementById("procLine");
    const processTrack = document.querySelector<HTMLElement>(".process-track");
    const steps = Array.from(document.querySelectorAll<HTMLElement>(".step"));
    let scrollTicking = false;
    let lastFill = -1;

    const updateOnScroll = () => {
      scrollTicking = false;
      nav?.classList.toggle("scrolled", window.scrollY > 20);

      if (processTrack && procLine) {
        const rect = processTrack.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          const fill = Math.max(0, Math.min(1, (window.innerHeight * 0.75 - rect.top) / (rect.height * 0.9)));
          const rounded = Math.round(fill * 100) / 100;
          if (rounded !== lastFill) {
            lastFill = rounded;
            procLine.style.setProperty("--fill", String(rounded));
            steps.forEach((step, i) => step.classList.toggle("active", rounded >= i / steps.length + 0.05));
          }
        }
      }
    };
    const onScroll = () => {
      if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(updateOnScroll);
      }
    };
    on(window, "scroll", onScroll, { passive: true });
    updateOnScroll();

    /* ---------------- Reveal on scroll ---------------- */
    const revealEls = document.querySelectorAll<HTMLElement>(".reveal");
    if (prefersReducedMotion()) {
      revealEls.forEach((el) => el.classList.add("in"));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
      );
      revealEls.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }

    /* ---------------- Mobile nav ---------------- */
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    if (hamburgerBtn && nav) {
      on(hamburgerBtn, "click", () => {
        const open = nav.classList.toggle("mobile-open");
        hamburgerBtn.setAttribute("aria-expanded", String(open));
      });
      nav.querySelectorAll<HTMLElement>(".nav-links a").forEach((link) =>
        on(link, "click", () => {
          nav.classList.remove("mobile-open");
          hamburgerBtn.setAttribute("aria-expanded", "false");
        }),
      );
    }

    /* ---------------- Services: tabs on desktop, accordion on mobile ---------------- */
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".svc-tab"));
    const setActive = (tab: HTMLButtonElement | null) => {
      tabs.forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle("active", isActive);
        t.setAttribute("aria-expanded", String(isActive));
        const panel = document.getElementById(t.getAttribute("aria-controls") || "");
        panel?.classList.toggle("active", isActive);
      });
    };
    tabs.forEach((tab) =>
      on(tab, "click", () => {
        const isMobile = window.innerWidth <= 960;
        if (isMobile && tab.classList.contains("active")) {
          setActive(null);
          return;
        }
        setActive(tab);
        if (isMobile) {
          requestAnimationFrame(() => {
            const top = tab.getBoundingClientRect().top;
            if (top < 80) window.scrollBy({ top: top - 90, behavior: "smooth" });
          });
        }
      }),
    );
    labels.forEach((label) =>
      on(label, "click", () => {
        const tab = tabs.find((t) => t.dataset.svc === label.dataset.svc);
        if (tab) setActive(tab);
      }),
    );
    // Desktop always shows one panel; restore it if the viewport grows back.
    on(window, "resize", () => {
      if (window.innerWidth > 960 && !tabs.some((t) => t.classList.contains("active"))) {
        setActive(tabs[0] ?? null);
      }
    }, { passive: true });

    /* ---------------- Contact forms ---------------- */
    const contactSection = document.getElementById("contact");
    const ctaForm = document.getElementById("ctaForm") as HTMLFormElement | null;
    if (ctaForm) {
      on(ctaForm, "submit", (e) => {
        e.preventDefault();
        const email = (document.getElementById("ctaEmail") as HTMLInputElement | null)?.value ?? "";
        if (!email || !email.includes("@")) return;
        const target = document.getElementById("contactEmail") as HTMLInputElement | null;
        if (target) target.value = email;
        contactSection?.classList.add("expanded");
        window.setTimeout(() => document.getElementById("contactName")?.focus(), 150);
      });
    }

    const ctaExpandedForm = document.getElementById("ctaExpandedForm") as HTMLFormElement | null;
    if (ctaExpandedForm) {
      on(ctaExpandedForm, "submit", (e) => {
        e.preventDefault();
        contactSection?.classList.add("submitted");
        const timer = window.setTimeout(() => {
          contactSection?.classList.remove("submitted", "expanded");
          ctaExpandedForm.reset();
          const email = document.getElementById("ctaEmail") as HTMLInputElement | null;
          if (email) email.value = "";
        }, 6000);
        cleanups.push(() => window.clearTimeout(timer));
      });
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />;
}
