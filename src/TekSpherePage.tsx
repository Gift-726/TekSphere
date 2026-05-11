import { useEffect } from "react";
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

export default function TekSpherePage() {
  useEffect(() => {
    const root = document.documentElement;
    let currentTweaks = { ...TWEAK_DEFAULTS };

    const applyTweaks = (t: Tweaks) => {
      root.setAttribute("data-theme", t.theme || "light");
      root.style.setProperty("--blur", `${t.blur ?? 18}px`);

      document.querySelectorAll<HTMLElement>("[data-theme-set]").forEach((button) => {
        button.classList.toggle("on", button.dataset.themeSet === (t.theme || "light"));
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
        if (emailInput) emailInput.value = "";
        const ctaOk = document.getElementById("ctaOk");
        ctaOk?.classList.add("show");
        setTimeout(() => ctaOk?.classList.remove("show"), 4000);
      };
      ctaForm.addEventListener("submit", submitHandler);
      cleanups.push(() => ctaForm.removeEventListener("submit", submitHandler));
    }

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
