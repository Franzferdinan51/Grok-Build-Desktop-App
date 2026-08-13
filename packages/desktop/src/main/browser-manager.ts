import type { Browser, Page } from "playwright"

type PlaywrightChromium = typeof import("playwright").chromium

export type BrowserPageInfo = {
  url: string
  title: string
  text: string
  html: string
  viewport: { width: number; height: number }
  links: { text: string; href: string }[]
  controls: { index: number; tag: string; type: string | null; label: string; disabled: boolean }[]
  screenshotPath: string
}

export class BrowserManager {
  private browser: Browser | null = null
  private page: Page | null = null
  private usingBrowserOS = false
  private chromium: PlaywrightChromium | null = null

  private async playwrightChromium(): Promise<PlaywrightChromium> {
    if (!this.chromium) this.chromium = (await import("playwright")).chromium
    return this.chromium
  }

  private async browserOsEndpoint(): Promise<string | undefined> {
    const configured = process.env.BROWSEROS_CDP_URL?.trim()
    if (configured) return configured
    try {
      const response = await fetch("http://127.0.0.1:9114/json/version", { signal: AbortSignal.timeout(500) })
      if (!response.ok) return undefined
      const details = await response.json() as { webSocketDebuggerUrl?: string }
      return details.webSocketDebuggerUrl ? "http://127.0.0.1:9114" : undefined
    } catch { return undefined }
  }

  async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser
    const chromium = await this.playwrightChromium()
    // BrowserOS exposes Chromium CDP locally. Use its existing profile when
    // available; otherwise keep a private browser-use style session.
    const browserOsCdp = await this.browserOsEndpoint()
    this.usingBrowserOS = Boolean(browserOsCdp)
    this.browser = browserOsCdp
      ? await chromium.connectOverCDP(browserOsCdp)
      : await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] })
    return this.browser
  }

  async ensurePage(): Promise<Page> {
    const browser = await this.ensureBrowser()
    if (this.page && !this.page.isClosed()) return this.page
    if (this.usingBrowserOS) {
      const context = browser.contexts()[0]
      if (!context) throw new Error("BrowserOS connected but did not expose a browser context")
      // Keep the user's existing BrowserOS tabs untouched by using a dedicated
      // tab in its logged-in profile for this Browser Agent session.
      this.page = await context.newPage()
      await this.page.setViewportSize({ width: 1280, height: 800 })
      return this.page
    }
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    })
    this.page = await context.newPage()
    return this.page
  }

  async nav(url: string): Promise<{ ok: boolean; url: string; title: string }> {
    let target: URL
    try { target = new URL(url) } catch { throw new Error("Enter a valid HTTP(S) URL") }
    if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Browser Agent only navigates to HTTP(S) URLs")
    const page = await this.ensurePage()
    const response = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 30000 })
    await page.waitForTimeout(1000)
    return {
      ok: response?.ok() ?? false,
      url: page.url(),
      title: await page.title(),
    }
  }

  async snapshot(): Promise<BrowserPageInfo> {
    const page = await this.ensurePage()
    const url = page.url()
    const title = await page.title()

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({ text: a.textContent?.trim().slice(0, 80) ?? "", href: (a as HTMLAnchorElement).href }))
        .filter((l) => l.href && !l.href.startsWith("javascript:"))
        .slice(0, 50)
    )

    const controls = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button, input, select, textarea, a[href], [onclick], [role=button]"))
        .slice(0, 80)
        .map((el, index) => {
          const tag = el.tagName.toLowerCase()
          const type = (el as HTMLInputElement).type ?? null
          let label = ""
          if (el.getAttribute("aria-label")) label = el.getAttribute("aria-label")!
          else if (el.textContent?.trim()) label = el.textContent.trim().slice(0, 60)
          else if ((el as HTMLInputElement).placeholder) label = (el as HTMLInputElement).placeholder
          else label = `${tag}${type ? `(${type})` : ""}`
          return { index, tag, type, label, disabled: (el as HTMLButtonElement).disabled }
        })
    )

    const screenshotPath = `/tmp/browser-screenshot-${Date.now()}.png`
    await page.screenshot({ path: screenshotPath, fullPage: false })

    return {
      url,
      title,
      text: await page.innerText("body").catch(() => ""),
      html: await page.content(),
      viewport: page.viewportSize() ?? { width: 1280, height: 800 },
      links,
      controls,
      screenshotPath,
    }
  }

  async click(target: string): Promise<{ ok: boolean; error?: string }> {
    const page = await this.ensurePage()
    try {
      const index = target.match(/^index:(\d+)$/)?.[1]
      if (index !== undefined) await page.locator("button, input, select, textarea, a[href], [onclick], [role=button]").nth(Number(index)).click({ timeout: 10_000 })
      else await page.click(target, { timeout: 10_000 })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }

  async type(selector: string, text: string): Promise<{ ok: boolean; error?: string }> {
    const page = await this.ensurePage()
    try {
      await page.fill(selector, text)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }

  async screenshot(): Promise<{ ok: boolean; path: string; error?: string }> {
    const page = await this.ensurePage()
    try {
      const screenshotPath = `/tmp/browser-screenshot-${Date.now()}.png`
      await page.screenshot({ path: screenshotPath, fullPage: false })
      return { ok: true, path: screenshotPath }
    } catch (e) {
      return { ok: false, path: "", error: String(e) }
    }
  }

  async status(): Promise<{ running: boolean; url?: string; title?: string }> {
    if (!this.page || this.page.isClosed()) return { running: false }
    return {
      running: true,
      url: this.page.url(),
      title: await this.page.title().catch(() => ""),
    }
  }

  async stop(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {})
      this.page = null
    }
    if (this.browser && !this.usingBrowserOS) {
      await this.browser.close().catch(() => {})
    }
    this.browser = null
    this.usingBrowserOS = false
  }
}
