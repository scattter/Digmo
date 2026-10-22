import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiResponseError, register } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("register API client", () => {
  it("sends public registration credentials and returns the created user", async () => {
    const payload = { user: { id: "user-1", username: "new_user", role: "user", status: "active" } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(register("new_user", "test-password-123")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/v1/auth/register", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ username: "new_user", password: "test-password-123" })
    }));
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get("content-type")).toBe("application/json");
    expect(new Headers(options.headers).has("authorization")).toBe(false);
  });

  it("preserves registration conflict details for the form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "CONFLICT", message: "用户名已存在"
    }), { status: 409 })));

    await expect(register("new_user", "test-password-123")).rejects.toMatchObject({
      name: "ApiResponseError", status: 409, message: "注册失败: 用户名已存在"
    } satisfies Partial<ApiResponseError>);
  });
});
