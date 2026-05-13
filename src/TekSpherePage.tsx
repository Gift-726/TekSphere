import { useEffect } from "react";
import createGlobe from "cobe";
import bodyHtml from "./teksphere-body.html?raw";
import "./teksphere.css";

type Tweaks = {
  theme: "light" | "dark";
  blur: number;
};

const TWEAK_DEFAULTS: Tweaks = {
  theme: "dark",
  blur: 18,
};

const showcaseDefaultMarkers = [
  {
    id: "default-sf",
    location: [37.7595, -122.4367] as [number, number],
    label: "Enterprise Infrastructure",
  },
  {
    id: "default-tokyo",
    location: [35.6762, 139.6503] as [number, number],
    label: "Application Development",
  },
  {
    id: "default-sydney",
    location: [-33.8688, 151.2093] as [number, number],
    label: "Intelligent Building",
  },
  {
    id: "default-capetown",
    location: [-33.9249, 18.4241] as [number, number],
    label: "Telephony Solutions",
  },
  {
    id: "default-dubai",
    location: [25.2048, 55.2708] as [number, number],
    label: "IT Support",
  },
  {
    id: "default-paris",
    location: [48.8566, 2.3522] as [number, number],
    label: "Enterprise Security",
  },
];

export default function TekSpherePage() {
  useEffect(() => {
    const root = document.documentElement;
    let currentTweaks = { ...TWEAK_DEFAULTS };
    const globeThemeUpdaters: Array<() => void> = [];
    const applyGlobeTheme = () => globeThemeUpdaters.forEach((fn) => fn());

    const applyTweaks = (t: Tweaks) => {
      root.setAttribute("data-theme", t.theme || "light");
      root.style.setProperty("--blur", `${t.blur ?? 18}px`);
      applyGlobeTheme();

      document.querySelectorAll<HTMLElement>("[data-theme-set]").forEach((button) => {
        button.classList.toggle("on", button.dataset.themeSet === (t.theme || "light"));
      });

      document.querySelectorAll<HTMLImageElement>(".brand-logo").forEach((img) => {
        img.src = t.theme === "dark" ? "/dark-logo.png" : "/Teksphere_Logo.png";
      });

      const blurRange = document.getElementById("blurRange") as HTMLInputElement | null;
      const blurVal = document.getElementById("blurVal");
      if (blurRange) blurRange.value = String(t.blur ?? 18);
      if (blurVal) blurVal.textContent = `${t.blur ?? 18}px`;
    };

    const setTweak = (key: keyof Tweaks, value: Tweaks[keyof Tweaks]) => {
      currentTweaks = { ...currentTweaks, [key]: value } as Tweaks;
      applyTweaks(currentTweaks);
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [key]: value } }, "*");
    };

    applyTweaks(currentTweaks);

    const messageHandler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "__activate_edit_mode") {
        document.getElementById("tweaksPanel")?.classList.add("on");
      } else if (e.data.type === "__deactivate_edit_mode") {
        document.getElementById("tweaksPanel")?.classList.remove("on");
      }
    };
    window.addEventListener("message", messageHandler);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");

    const cleanups: Array<() => void> = [];
    let extraRotationSpeed = 0;

    ["teksphereGlobe", "teksphereGlobeInfra"].forEach((canvasId) => {
      const globeCanvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
      if (!globeCanvas) return;

      let currentPhi = 0;
      let currentTheta = 0.2;
      let targetPhi = 0;
      let targetTheta = 0.2;
      let globeAnimationId = 0;
      let isDragging = false;
      let lastX = 0;
      let lastY = 0;

      const clampTheta = (value: number) => Math.max(-0.65, Math.min(0.85, value));
      const getGlobeThemeOptions = () => {
        const isDark = root.getAttribute("data-theme") === "dark";

        return isDark
          ? {
              dark: 1,
              diffuse: 1.25,
              mapBrightness: 6,
              baseColor: [0.08, 0.13, 0.24] as [number, number, number],
              markerColor: [0.45, 0.72, 1] as [number, number, number],
              glowColor: [0.05, 0.12, 0.26] as [number, number, number],
              opacity: 0.9,
            }
          : {
              dark: 0,
              diffuse: 1.5,
              mapBrightness: 10,
              baseColor: [1, 1, 1] as [number, number, number],
              markerColor: [0.3, 0.45, 0.85] as [number, number, number],
              glowColor: [0.94, 0.93, 0.91] as [number, number, number],
              opacity: 0.7,
            };
      };

      const size = globeCanvas.offsetWidth || 560;
      const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? 1.8 : 2);
      const globe = createGlobe(globeCanvas, {
        devicePixelRatio: dpr,
        width: size,
        height: size,
        phi: 0,
        theta: 0.2,
        mapSamples: 16000,
        markerElevation: 0.01,
        markers: showcaseDefaultMarkers.map((marker) => ({
          location: marker.location,
          size: 0.03,
          id: marker.id,
        })),
        ...getGlobeThemeOptions(),
      });
      const updater = () => globe.update(getGlobeThemeOptions());
      globeThemeUpdaters.push(updater);

      const animateGlobe = () => {
        if (!isDragging) targetPhi += 0.003 + extraRotationSpeed;

        currentPhi += (targetPhi - currentPhi) * 0.08;
        currentTheta += (targetTheta - currentTheta) * 0.08;
        globe.update({ phi: currentPhi, theta: currentTheta });
        globeAnimationId = requestAnimationFrame(animateGlobe);
      };

      const handleMouseDown = (event: MouseEvent) => {
        isDragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
      };

      const handleMouseMove = (event: MouseEvent) => {
        if (!isDragging) return;
        const deltaX = event.clientX - lastX;
        const deltaY = event.clientY - lastY;
        targetPhi += deltaX * 0.01;
        targetTheta = clampTheta(targetTheta + deltaY * 0.01);
        lastX = event.clientX;
        lastY = event.clientY;
      };

      const handleMouseUp = () => {
        isDragging = false;
      };

      globeCanvas.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      animateGlobe();

      window.setTimeout(() => {
        globeCanvas.style.opacity = "1";
      });

      cleanups.push(() => {
        cancelAnimationFrame(globeAnimationId);
        globe.destroy();
        const index = globeThemeUpdaters.indexOf(updater);
        if (index > -1) globeThemeUpdaters.splice(index, 1);
        globeCanvas.removeEventListener("mousedown", handleMouseDown);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      });
    });

    document.querySelectorAll<HTMLElement>("[data-theme-set]").forEach((button) => {
      const clickHandler = () => setTweak("theme", (button.dataset.themeSet as Tweaks["theme"]) || "light");
      button.addEventListener("click", clickHandler);
      cleanups.push(() => button.removeEventListener("click", clickHandler));
    });

    const themeBtn = document.getElementById("themeBtn");
    if (themeBtn) {
      const clickHandler = () => setTweak("theme", currentTweaks.theme === "light" ? "dark" : "light");
      themeBtn.addEventListener("click", clickHandler);
      cleanups.push(() => themeBtn.removeEventListener("click", clickHandler));
    }

    const blurRange = document.getElementById("blurRange") as HTMLInputElement | null;
    if (blurRange) {
      const inputHandler = (e: Event) => setTweak("blur", Number((e.target as HTMLInputElement).value));
      blurRange.addEventListener("input", inputHandler);
      cleanups.push(() => blurRange.removeEventListener("input", inputHandler));
    }

    const cursorGlow = document.getElementById("cg") as HTMLDivElement | null;
    let cgX = window.innerWidth / 2;
    let cgY = window.innerHeight / 2;
    let cgTX = cgX;
    let cgTY = cgY;
    let rafId = 0;

    const mouseTracker = (e: MouseEvent) => {
      cgTX = e.clientX;
      cgTY = e.clientY;
    };
    window.addEventListener("mousemove", mouseTracker);

    const tickCg = () => {
      cgX += (cgTX - cgX) * 0.12;
      cgY += (cgTY - cgY) * 0.12;
      if (cursorGlow) {
        cursorGlow.style.left = `${cgX}px`;
        cursorGlow.style.top = `${cgY}px`;
      }
      rafId = requestAnimationFrame(tickCg);
    };
    tickCg();

    document.querySelectorAll<HTMLElement>(".magnetic").forEach((el) => {
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
      };
      const onLeave = () => {
        el.style.transform = "";
      };
      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
      });
    });

    document.querySelectorAll<HTMLElement>(".tilt").forEach((el) => {
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const rx = (py - 0.5) * -8;
        const ry = (px - 0.5) * 8;
        el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
        el.style.setProperty("--mx", `${px * 100}%`);
        el.style.setProperty("--my", `${py * 100}%`);
      };
      const onLeave = () => {
        el.style.transform = "";
      };
      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
      });
    });

    const revealEls = document.querySelectorAll<HTMLElement>(".reveal, .reveal-children");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    revealEls.forEach((el) => io.observe(el));

    const parallaxContainers = document.querySelectorAll<HTMLElement>("[data-parallax], [data-stage]");
    const onScroll = () => {
      const nav = document.querySelector<HTMLElement>(".nav");
      if (nav) {
        if (window.scrollY > 20) {
          nav.classList.add("scrolled");
          // Force backdrop-filter via inline style — cannot be stripped by build tools
          nav.style.setProperty("backdrop-filter", "blur(18px) saturate(140%)");
          nav.style.setProperty("-webkit-backdrop-filter", "blur(18px) saturate(140%)");
        } else {
          nav.classList.remove("scrolled");
          nav.style.removeProperty("backdrop-filter");
          nav.style.removeProperty("-webkit-backdrop-filter");
        }
      }
      parallaxContainers.forEach((container) => {
        const rect = container.getBoundingClientRect();
        const vh = window.innerHeight;
        if (rect.bottom < 0 || rect.top > vh) return;
        const progress = (vh - rect.top) / (vh + rect.height);
        container.querySelectorAll<HTMLElement>("[data-depth]").forEach((el) => {
          const depth = Number(el.dataset.depth) || 0.3;
          const offset = (progress - 0.5) * 100 * depth;
          if (el.classList.contains("card-float") || el.classList.contains("device")) {
            el.style.transform = `translate3d(0, ${offset}px, 0)`;
          } else {
            el.style.transform = `translate3d(0, ${offset * 0.6}px, 0)`;
          }
        });
      });

      const track = document.querySelector<HTMLElement>(".process-track");
      if (track) {
        const tr = track.getBoundingClientRect();
        const tp = Math.max(0, Math.min(1, (window.innerHeight * 0.7 - tr.top) / tr.height));
        document.getElementById("procLine")?.style.setProperty("--fill", `${tp * 100}%`);
        document.querySelectorAll<HTMLElement>(".step").forEach((step, i) => {
          step.classList.toggle("active", tp > (i + 0.5) / 4);
        });
      }

      const introTrack = document.getElementById("heroScrollTrack");
      const rightCol = document.querySelector<HTMLElement>(".teksphere-hero-right");
      const globeWrap = document.querySelector<HTMLElement>(".teksphere-globe-wrap");
      const heroCopyIntro = document.getElementById("heroCopyIntro");

      if (introTrack && rightCol && globeWrap) {
        const tr = introTrack.getBoundingClientRect();
        const maxScroll = tr.height - window.innerHeight;
        const progress = maxScroll > 0 ? Math.max(0, Math.min(1, -tr.top / maxScroll)) : 1;
        const dockedProgress = Math.min(1, progress * 1.15);

        // Smooth cosine interpolation for buttery, ultra-graceful cinematic docking
        const weight = 0.5 * (1 + Math.cos(dockedProgress * Math.PI));

        const screenCenterX = window.innerWidth / 2;
        // Shift target Y slightly upward to reduce gap beneath the navbar and prevent bottom vh overflow
        const screenCenterY = (window.innerHeight / 2) + 35;
        const colRect = rightCol.getBoundingClientRect();
        const colCenterX = colRect.left + colRect.width / 2;
        const colCenterY = colRect.top + colRect.height / 2;

        const neededTx = screenCenterX - colCenterX;
        const neededTy = screenCenterY - colCenterY;

        // Apply a gentle 1.15x standalone scale so the base 580px globe displays majestically without exceeding screen vh bounds
        globeWrap.style.transform = `translate3d(${neededTx * weight}px, ${neededTy * weight}px, 0) scale(${1 + 0.40 * weight})`;
        extraRotationSpeed = weight * 0.015;

        if (heroCopyIntro) {
          const easeIn = 1 - weight;
          heroCopyIntro.style.opacity = String(easeIn);
          heroCopyIntro.style.transform = `translate3d(0, ${weight * 40}px, 0)`;
          heroCopyIntro.style.pointerEvents = easeIn > 0.5 ? "auto" : "none";
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const stage = document.querySelector<HTMLElement>("[data-stage]");
    if (stage) {
      const inner = stage.querySelector<HTMLElement>(".stage-inner");
      const onMove = (e: MouseEvent) => {
        if (!inner) return;
        const r = stage.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        inner.style.transform = `rotateY(${px * 6}deg) rotateX(${py * -6}deg)`;
      };
      const onLeave = () => {
        if (inner) inner.style.transform = "";
      };
      stage.addEventListener("mousemove", onMove);
      stage.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        stage.removeEventListener("mousemove", onMove);
        stage.removeEventListener("mouseleave", onLeave);
      });
    }

    const ctaForm = document.getElementById("ctaForm") as HTMLFormElement | null;
    if (ctaForm) {
      const submitHandler = (e: Event) => {
        e.preventDefault();
        const emailInput = document.getElementById("ctaEmail") as HTMLInputElement | null;
        const email = emailInput?.value ?? "";
        if (!email || !email.includes("@")) return;

        const targetEmailInput = document.getElementById("contactEmail") as HTMLInputElement | null;
        if (targetEmailInput) {
          targetEmailInput.value = email;
        }

        const contactSec = document.getElementById("contact");
        contactSec?.classList.add("expanded");

        setTimeout(() => {
          document.getElementById("contactName")?.focus();
        }, 300);
      };
      ctaForm.addEventListener("submit", submitHandler);
      cleanups.push(() => ctaForm.removeEventListener("submit", submitHandler));
    }

    const ctaExpandedForm = document.getElementById("ctaExpandedForm") as HTMLFormElement | null;
    if (ctaExpandedForm) {
      const expandedSubmitHandler = (e: Event) => {
        e.preventDefault();
        const contactSec = document.getElementById("contact");
        contactSec?.classList.add("submitted");
        setTimeout(() => {
          contactSec?.classList.remove("submitted", "expanded");
          ctaExpandedForm.reset();
          const origEmailInput = document.getElementById("ctaEmail") as HTMLInputElement | null;
          if (origEmailInput) origEmailInput.value = "";
        }, 6000);
      };
      ctaExpandedForm.addEventListener("submit", expandedSubmitHandler);
      cleanups.push(() => ctaExpandedForm.removeEventListener("submit", expandedSubmitHandler));
    }

    const accordionHeaders = document.querySelectorAll<HTMLElement>(".svc-card-header");
    accordionHeaders.forEach((header) => {
      const clickHandler = () => {
        const card = header.closest(".svc-card");
        if (!card) return;

        const isActive = card.classList.contains("active");
        const colWrapper = card.closest(".svc-col");

        document.querySelectorAll(".svc-card").forEach((c) => {
          c.classList.remove("active", "shrink");
        });

        if (!isActive) {
          card.classList.add("active");
          if (colWrapper) {
            colWrapper.querySelectorAll(".svc-card").forEach((partner) => {
              if (partner !== card) {
                partner.classList.add("shrink");
              }
            });
          }
        }
      };
      header.addEventListener("click", clickHandler);
      cleanups.push(() => header.removeEventListener("click", clickHandler));
    });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", mouseTracker);
      window.removeEventListener("message", messageHandler);
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />;
}
