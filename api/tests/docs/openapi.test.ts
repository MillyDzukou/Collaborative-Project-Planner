import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { parse } from "yaml";
import { app } from "../../src/server.js";

const SPEC_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/openapi.yaml");

interface ExpressLayer {
  route?: { path: string; methods: Record<string, boolean> };
  name?: string;
  regexp?: RegExp & { fast_slash?: boolean };
  handle?: { stack?: ExpressLayer[] };
}

/** `^\/auth\/?(?=\/|$)` -> `/auth`; a root-mounted router has `fast_slash`. */
function mountPrefix(layer: ExpressLayer): string {
  if (!layer.regexp || layer.regexp.fast_slash) return "";
  return layer.regexp.source.replace("^\\/", "/").replace("\\/?(?=\\/|$)", "").replace(/\\\//g, "/");
}

/** Every route registered on the real Express app, as "METHOD /path/{param}". */
function registeredRoutes(): Set<string> {
  const found = new Set<string>();
  const walk = (stack: ExpressLayer[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          found.add(`${method.toUpperCase()} ${prefix}${layer.route.path}`.replace(/:(\w+)/g, "{$1}"));
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPrefix(layer));
      }
    }
  };
  const root = (app as unknown as { _router: { stack: ExpressLayer[] } })._router.stack;
  walk(root, "");
  return found;
}

function documentedRoutes(spec: { paths: Record<string, Record<string, unknown>> }): Set<string> {
  const methods = ["get", "post", "put", "patch", "delete"];
  const found = new Set<string>();
  for (const [route, item] of Object.entries(spec.paths)) {
    for (const method of methods) {
      if (item[method]) found.add(`${method.toUpperCase()} ${route}`);
    }
  }
  return found;
}

describe("docs/openapi.yaml", () => {
  const spec = parse(readFileSync(SPEC_PATH, "utf8"));

  it("is a valid OpenAPI document (structure and all $refs resolve)", async () => {
    await expect(SwaggerParser.validate(SPEC_PATH)).resolves.toBeDefined();
  });

  it("documents exactly the routes the API registers (no drift)", () => {
    const actual = registeredRoutes();
    const documented = documentedRoutes(spec);

    // Sanity: route discovery actually found the app's routes, otherwise this test proves nothing.
    expect(actual.size).toBeGreaterThan(15);

    const undocumented = [...actual].filter((r) => !documented.has(r)).sort();
    const stale = [...documented].filter((r) => !actual.has(r)).sort();
    expect({ undocumented, stale }).toEqual({ undocumented: [], stale: [] });
  });
});
