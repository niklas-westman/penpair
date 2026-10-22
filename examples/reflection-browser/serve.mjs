import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const files = new Map([
  [
    "/",
    [
      "index.html",
      "text/html",
    ],
  ],
  [
    "/Abel-Regular.ttf",
    [
      "Abel-Regular.ttf",
      "font/ttf",
    ],
  ],
]);
const server = createServer(async (request, response) => {
  const entry = files.get(new URL(request.url, "http://localhost").pathname);
  if (!entry) {
    response.writeHead(404).end();
    return;
  }
  try {
    response.writeHead(200, {
      "Content-Type": entry[1],
      "Cache-Control": "no-store",
    });
    response.end(await readFile(new URL(`fixture/${entry[0]}`, import.meta.url)));
  } catch {
    response.writeHead(500).end();
  }
});
server.listen(Number(process.env.PENPAIR_EXAMPLE_PORT ?? 4174), "127.0.0.1", () =>
  console.log(`Browser fixture: http://127.0.0.1:${server.address().port}`),
);
