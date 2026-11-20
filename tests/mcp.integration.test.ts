import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";

import { POST } from "../src/app/api/mcp/route";
import { prisma } from "../src/lib/prisma";
import { assertSafeLedgerIntegrationDatabase } from "./helpers/ledger-test-db";

assertSafeLedgerIntegrationDatabase();

const TOKEN = "t".repeat(40);
process.env.MCP_API_TOKEN = TOKEN;
const runKey = randomUUID().slice(0, 8);
const createdStudentIds: string[] = [];

async function rpc(method: string, params: unknown, auth = `Bearer ${TOKEN}`) {
  const response = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: auth,
        "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200)}`
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    })
  );
  return { status: response.status, body: response.status === 200 ? await response.json() : await response.text() };
}

describe("MCP endpoint", { concurrency: false }, () => {
  after(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.$disconnect();
  });

  test("rejects a wrong token", async () => {
    const result = await rpc("tools/list", {}, "Bearer wrong");
    assert.equal(result.status, 401);
  });

  test("lists the 7 tools", async () => {
    const result = await rpc("tools/list", {});
    assert.equal(result.status, 200);
    const names = (result.body.result.tools as Array<{ name: string }>).map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "chi_tiet_hoc_sinh",
      "cong_no",
      "danh_sach_lop",
      "tai_chinh_thang",
      "them_hoc_sinh",
      "them_hoc_sinh_vao_lop",
      "tim_hoc_sinh"
    ]);
  });

  test("them_hoc_sinh creates the student and an audit row by claude-mcp", async () => {
    const phone = `09${String(Date.now()).slice(-8)}`;
    const result = await rpc("tools/call", {
      name: "them_hoc_sinh",
      arguments: { fullName: `MCP Test ${runKey}`, phone }
    });
    assert.equal(result.status, 200);
    const payload = JSON.parse(result.body.result.content[0].text);
    assert.ok(payload.studentId);
    createdStudentIds.push(payload.studentId);

    const log = await prisma.auditLog.findFirst({ where: { entityType: "Student", entityId: payload.studentId } });
    assert.equal(log?.action, "student.created");
    assert.equal(log?.actorUsername, "claude-mcp");
    assert.equal(log?.studentId, payload.studentId);

    const duplicate = await rpc("tools/call", {
      name: "them_hoc_sinh",
      arguments: { fullName: `MCP Test ${runKey}`, phone }
    });
    assert.equal(duplicate.body.result.isError, true);
  });
});
