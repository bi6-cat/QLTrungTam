import path from "node:path";

/**
 * Sơ đồ phụ thuộc được phép giữa các module trong src/modules: module ở khoá chỉ được import
 * những module trong danh sách. Thêm module mới thì khai báo ở đây trước (xem src/modules/README.md).
 */
export const MODULE_DEPENDENCIES: Record<string, readonly string[]> = {
  core: [],
  identity: ["core"],
  center: ["core"],
  learning: ["core", "identity", "center"]
};

export type SourceFile = { path: string; source: string };
export type Violation = { file: string; specifier: string; reason: string };

const STATIC_IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

export function importSpecifiers(source: string) {
  const found: string[] = [];
  for (const pattern of [STATIC_IMPORT, DYNAMIC_IMPORT]) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** Đường dẫn trong repo (dạng posix, không đuôi file) mà specifier trỏ tới; null = gói ngoài. */
function resolveTarget(fromFile: string, specifier: string) {
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  if (specifier.startsWith(".")) return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  return null;
}

function moduleOf(repoPath: string) {
  const match = /^src\/modules\/([^/]+)(\/|$)/.exec(repoPath);
  return match ? match[1] : null;
}

function isPublicEntry(target: string, moduleName: string) {
  const base = `src/modules/${moduleName}`;
  return target === base || target === `${base}/index`;
}

export function checkModuleBoundaries(
  files: readonly SourceFile[],
  dependencies: Record<string, readonly string[]> = MODULE_DEPENDENCIES
) {
  const violations: Violation[] = [];
  for (const file of files) {
    const fromModule = moduleOf(file.path);
    if (fromModule && !(fromModule in dependencies)) {
      violations.push({ file: file.path, specifier: "", reason: `module "${fromModule}" chưa khai báo trong MODULE_DEPENDENCIES` });
      continue;
    }
    for (const specifier of importSpecifiers(file.source)) {
      const target = resolveTarget(file.path, specifier);
      if (!target) continue;
      const report = (reason: string) => violations.push({ file: file.path, specifier, reason });
      const targetModule = moduleOf(target);

      if (targetModule && targetModule !== fromModule) {
        if (!isPublicEntry(target, targetModule)) {
          report(`chỉ được import "@/modules/${targetModule}", không vào file bên trong module`);
        } else if (specifier.startsWith(".")) {
          report(`dùng "@/modules/${targetModule}" thay cho đường dẫn tương đối sang module khác`);
        }
        if (fromModule && !dependencies[fromModule].includes(targetModule)) {
          report(`module "${fromModule}" không được phụ thuộc "${targetModule}"`);
        }
      }
      if (fromModule && fromModule !== "core" && target.startsWith("src/lib/")) {
        report(`chỉ module core được import src/lib; lấy qua "@/modules/core"`);
      }
      if (fromModule && target.startsWith("src/app/")) {
        report("module không được import giao diện trong src/app");
      }
    }
  }
  return violations;
}

/** Tên một chu trình trong sơ đồ phụ thuộc (ví dụ "a → b → a"), hoặc null nếu không có. */
export function findDependencyCycle(dependencies: Record<string, readonly string[]>) {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (name: string): string | null => {
    if (state.get(name) === "done") return null;
    if (state.get(name) === "visiting") return [...stack.slice(stack.indexOf(name)), name].join(" → ");
    state.set(name, "visiting");
    stack.push(name);
    for (const next of dependencies[name] ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(name, "done");
    return null;
  };
  for (const name of Object.keys(dependencies)) {
    const cycle = visit(name);
    if (cycle) return cycle;
  }
  return null;
}
