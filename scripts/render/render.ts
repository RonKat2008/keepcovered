// Playwright + sharp renderer: HTML -> PNG with optional phone-photo effects.
import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Rng } from "../lib/util";

export interface PhotoParams {
  rot: number;
  blur: number;
  glareX: number;
  glareY: number;
  glare: number;
  shiftX: number;
  shiftY: number;
  scale: number;
  bg: string;
}

export interface RenderJob {
  html: string;
  out: string;
  width: number;
  height: number;
  photo?: PhotoParams;
  /** Selector inside #screen; the photo is cropped just below it so it (and everything above) is cut off. */
  cutBelow?: string;
}

const MAX_SIDE = 1600;

export function randomPhoto(rng: Rng): PhotoParams {
  const sign = rng.chance(0.5) ? 1 : -1;
  return {
    rot: sign * rng.float(1, 6),
    blur: rng.float(0, 1.2),
    glareX: rng.float(10, 90),
    glareY: rng.float(5, 70),
    glare: rng.float(0.25, 0.6),
    // Never crop away the key totals: stay well inside the frame.
    shiftX: rng.float(-18, 18),
    shiftY: rng.float(-22, 22),
    scale: rng.float(1.0, 1.07),
    bg: rng.pick(["#22252b", "#2d2a26", "#3a3329", "#1c2230"]),
  };
}

function wrapPhoto(html: string, bg: string): string {
  const glare = `<div id="glare" style="position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen"></div>`;
  return html
    .replace(
      "</style>",
      `html,body{background:${bg} !important}body{position:relative}#screen{transform-origin:50% 50%;border-radius:22px;box-shadow:0 18px 40px rgba(0,0,0,.55)}</style>`,
    )
    .replace('<div class="screen" id="screen">', '<div class="screen" id="screen">')
    .replace("</body>", `${glare}</body>`);
}

export class Renderer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async open(width: number, height: number): Promise<void> {
    this.browser = await chromium.launch();
    const ctx = await this.browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    this.page = await ctx.newPage();
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }

  /** Renders one job. The page viewport must match job.width/height. */
  async render(job: RenderJob): Promise<void> {
    const page = this.page;
    if (!page) throw new Error("renderer not open");
    await page.setViewportSize({ width: job.width, height: job.height });
    await page.setContent(job.photo ? wrapPhoto(job.html, job.photo.bg) : job.html, { waitUntil: "load" });
    if (job.photo) {
      const p = job.photo;
      let shiftY = p.shiftY;
      if (job.cutBelow) {
        const cut = await page.evaluate((sel) => {
          const s = document.getElementById("screen") as HTMLElement;
          const el = s.querySelector(sel) as HTMLElement;
          return el.getBoundingClientRect().bottom - s.getBoundingClientRect().top;
        }, job.cutBelow);
        shiftY = -(cut + 6);
      }
      await page.evaluate(
        ({ p, shiftY }) => {
          const s = document.getElementById("screen") as HTMLElement;
          s.style.transform = `translate(${p.shiftX}px, ${shiftY}px) rotate(${p.rot}deg) scale(${p.scale})`;
          s.style.filter = `blur(${p.blur}px)`;
          const g = document.getElementById("glare") as HTMLElement;
          g.style.background = `radial-gradient(circle at ${p.glareX}% ${p.glareY}%, rgba(255,255,255,${p.glare}) 0%, rgba(255,255,255,0) 45%)`;
        },
        { p, shiftY },
      );
    }
    const png = await page.screenshot({ type: "png" });
    const out = await sharp(png)
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .png({ palette: true, quality: 85, compressionLevel: 9 })
      .toBuffer();
    mkdirSync(dirname(job.out), { recursive: true });
    writeFileSync(job.out, out);
  }
}
