import { createServer, type Server } from "node:http"
import { realpath, readFile, stat } from "node:fs/promises"
import { extname, join, relative, resolve, sep } from "node:path"

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon" }

export class PreviewServer {
  private server: Server | null = null

  async start(workspace: string): Promise<{ url: string }> {
    await this.stop()
    const root = await realpath(workspace)
    const entry = join(root, "index.html")
    await stat(entry).catch(() => { throw new Error("No index.html was found in this workspace. Start the project dev server in Terminal, or generate a static index.html.") })
    this.server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname)
        const requested = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`)
        const rel = relative(root, requested)
        if (rel.startsWith(`..${sep}`) || rel === "..") throw new Error("Preview path escapes workspace")
        let file = requested
        if ((await stat(file)).isDirectory()) file = join(file, "index.html")
        const canonical = await realpath(file)
        const canonicalRel = relative(root, canonical)
        if (canonicalRel.startsWith(`..${sep}`) || canonicalRel === "..") throw new Error("Preview symlink escapes workspace")
        response.writeHead(200, { "content-type": TYPES[extname(canonical).toLowerCase()] || "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff" })
        response.end(await readFile(canonical))
      } catch (error) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
        response.end(error instanceof Error ? error.message : "Not found")
      }
    })
    await new Promise<void>((resolveListen, reject) => { this.server!.once("error", reject); this.server!.listen(0, "127.0.0.1", resolveListen) })
    const address = this.server.address()
    if (!address || typeof address === "string") throw new Error("Could not start preview server")
    return { url: `http://127.0.0.1:${address.port}` }
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (server) await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
  }
}
