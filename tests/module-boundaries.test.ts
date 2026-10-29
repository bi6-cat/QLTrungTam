import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import {
  checkModuleBoundaries,
  findDependencyCycle,
  importSpecifiers,
  MODULE_DEPENDENCIES
} from "./helpers/module-boundaries";

const ROOT = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function reasons(files: { path: string; source: string }[]) {
  return checkModuleBoundaries(files).map((v) => v.reason);
}

describe("importSpecifiers", () => {
  test("reads static, type-only, re-export, side-effect and dynamic imports", () => {
    const source = [
      'import { a } from "@/modules/core";',
      'import type { B } from "./b";',
      "import {\n  c,\n  d\n} from '../c';",
      'export * from "@/modules/identity";',
      'import "./side-effect";',
      'const m = await import("@/modules/learning/vocab");',
      'export const label = "không phải import";'
    ].join("\n");
    assert.deepEqual(importSpecifiers(source), [
      "@/modules/core",
      "./b",
      "../c",
      "@/modules/identity",
      "./side-effect",
      "@/modules/learning/vocab"
    ]);
  });
});

describe("checkModuleBoundaries", () => {
  test("allows a page to import a module through its index", () => {
    assert.deepEqual(reasons([{ path: "src/app/learn/page.tsx", source: 'import { x } from "@/modules/learning";' }]), []);
  });

  test("rejects reaching into another module's internals", () => {
    assert.match(
      reasons([{ path: "src/app/learn/page.tsx", source: 'import { x } from "@/modules/learning/vocab/grade";' }])[0],
      /chỉ được import "@\/modules\/learning"/
    );
  });

  test("allows declared dependencies and rejects undeclared ones", () => {
    assert.deepEqual(reasons([{ path: "src/modules/learning/vocab.ts", source: 'import { y } from "@/modules/center";' }]), []);
    assert.match(
      reasons([{ path: "src/modules/identity/session.ts", source: 'import { z } from "@/modules/learning";' }])[0],
      /"identity" không được phụ thuộc "learning"/
    );
  });

  test("rejects relative paths that cross into another module", () => {
    const found = reasons([{ path: "src/modules/learning/vocab/quiz.ts", source: 'import { y } from "../../center";' }]);
    assert.ok(found.some((r) => /thay cho đường dẫn tương đối/.test(r)));
  });

  test("allows relative imports inside the same module", () => {
    assert.deepEqual(reasons([{ path: "src/modules/learning/vocab/quiz.ts", source: 'import { g } from "../shared/grade";' }]), []);
  });

  test("only core may import src/lib", () => {
    assert.deepEqual(reasons([{ path: "src/modules/core/index.ts", source: 'export { prisma } from "@/lib/prisma";' }]), []);
    assert.match(
      reasons([{ path: "src/modules/learning/x.ts", source: 'import { prisma } from "@/lib/ledger";' }])[0],
      /chỉ module core được import src\/lib/
    );
  });

  test("modules may not import UI from src/app", () => {
    assert.match(
      reasons([{ path: "src/modules/learning/x.ts", source: 'import Page from "@/app/admin/page";' }])[0],
      /không được import giao diện/
    );
  });

  test("type-only and dynamic imports are checked too", () => {
    assert.equal(reasons([{ path: "src/modules/identity/a.ts", source: 'import type { Q } from "@/modules/learning";' }]).length, 1);
    assert.equal(reasons([{ path: "src/modules/identity/a.ts", source: 'await import("@/modules/learning");' }]).length, 1);
  });

  test("rejects files in an undeclared module", () => {
    assert.match(reasons([{ path: "src/modules/finance/x.ts", source: "" }])[0], /chưa khai báo/);
  });
});

describe("findDependencyCycle", () => {
  test("finds a cycle", () => {
    assert.equal(findDependencyCycle({ a: ["b"], b: ["c"], c: ["a"] }), "a → b → c → a");
  });

  test("declared module graph has no cycle", () => {
    assert.equal(findDependencyCycle(MODULE_DEPENDENCIES), null);
  });
});

describe("repository", () => {
  test("every folder in src/modules is declared", () => {
    const folders = readdirSync(path.join(ROOT, "src/modules")).filter((name) =>
      statSync(path.join(ROOT, "src/modules", name)).isDirectory()
    );
    for (const name of folders) assert.ok(name in MODULE_DEPENDENCIES, `src/modules/${name} chưa khai báo`);
  });

  test("source code respects module boundaries", () => {
    const files = sourceFiles(path.join(ROOT, "src")).map((full) => ({
      path: path.relative(ROOT, full).split(path.sep).join("/"),
      source: readFileSync(full, "utf8")
    }));
    assert.deepEqual(checkModuleBoundaries(files), []);
  });
});
