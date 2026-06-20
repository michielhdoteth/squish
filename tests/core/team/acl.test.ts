import { describe, expect, it } from "bun:test";
import { canReadMemory, canWriteMemory, getReadableScopes, getWriteableScopes } from "../../../core/team/acl.js";
import { filterMemoriesByScope } from "../../../core/team/scope-filter.js";

const owner = {
  id: "member-owner",
  projectId: "project-1",
  userId: "user-1",
  agentId: null,
  role: "owner" as const,
  joinedAt: new Date(),
  lastActiveAt: null,
  metadata: null,
};

const member = {
  id: "member-team",
  projectId: "project-1",
  userId: "user-2",
  agentId: null,
  role: "member" as const,
  joinedAt: new Date(),
  lastActiveAt: null,
  metadata: null,
};

const viewer = {
  id: "member-viewer",
  projectId: "project-1",
  userId: "user-3",
  agentId: null,
  role: "viewer" as const,
  joinedAt: new Date(),
  lastActiveAt: null,
  metadata: null,
};

describe("team ACL", () => {
  it("allows owners to read and write all scopes in their project", () => {
    const memory = { visibilityScope: "team", projectId: "project-1", userId: "user-9" };

    expect(canReadMemory(memory, owner)).toBe(true);
    expect(canWriteMemory(memory, owner)).toBe(true);
  });

  it("limits members to reading shared scopes and writing private own memories", () => {
    const teamMemory = { visibilityScope: "team", projectId: "project-1", userId: "user-9" };
    const privateOwnMemory = { visibilityScope: "private", projectId: "project-1", userId: "user-2" };
    const privateOtherMemory = { visibilityScope: "private", projectId: "project-1", userId: "user-9" };

    expect(canReadMemory(teamMemory, member)).toBe(true);
    expect(canWriteMemory(teamMemory, member)).toBe(false);
    expect(canWriteMemory(privateOwnMemory, member)).toBe(true);
    expect(canWriteMemory(privateOtherMemory, member)).toBe(false);
  });

  it("prevents viewers from writing", () => {
    const memory = { visibilityScope: "private", projectId: "project-1", userId: "user-3" };

    expect(canReadMemory(memory, viewer)).toBe(true);
    expect(canWriteMemory(memory, viewer)).toBe(false);
  });

  it("filters memories by readable scope", () => {
    const memories = [
      { id: "1", visibilityScope: "private", projectId: "project-1", userId: "user-2" },
      { id: "2", visibilityScope: "team", projectId: "project-1", userId: "user-9" },
      { id: "3", visibilityScope: "global", projectId: "project-2", userId: "user-8" },
    ];

    const filtered = filterMemoriesByScope(memories, member);
    expect(filtered.map((m) => m.id)).toEqual(["2", "3"]);
  });

  it("exposes role-derived readable and writable scopes", () => {
    expect(getReadableScopes(member)).toContain("team");
    expect(getWriteableScopes(member)).toEqual(["private"]);
  });
});
