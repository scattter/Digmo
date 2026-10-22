import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegisterPage from "./page";

const { register, router } = vi.hoisted(() => ({
  register: vi.fn(),
  router: { replace: vi.fn() }
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", () => ({ register, fetchMe: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({
  getAccessToken: () => undefined,
  clearAccessToken: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  register.mockResolvedValue({ user: { id: "user-1", username: "new_user", role: "user", status: "active" } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function submitForm(username = "new_user", password = "test-password-123", confirmPassword = password) {
  render(<App><RegisterPage /></App>);
  fireEvent.change(screen.getByLabelText("用户名"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: confirmPassword } });
  fireEvent.click(screen.getByRole("button", { name: /^注\s*册$/ }));
}

describe("self registration form", () => {
  it.each(["test-password-123", "😀".repeat(6)])("registers trimmed credentials (%s) and returns to login without saving a token", async (password) => {
    const saveStorage = vi.spyOn(Storage.prototype, "setItem");
    submitForm(" new_user ", ` ${password} `, password);

    await waitFor(() => expect(register).toHaveBeenCalledExactlyOnceWith("new_user", password));
    expect(await screen.findByText("注册成功，请登录")).toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/login");
    expect(saveStorage).not.toHaveBeenCalled();
  });

  it("blocks submission when confirmation does not match", async () => {
    submitForm("new_user", "test-password-123", "different-password");

    expect(await screen.findByText("两次输入的密码不一致")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each([
    { username: "新用户", password: "test-password-123", error: "用户名需为 3–32 位字母、数字、下划线或短横线" },
    { username: "ab", password: "test-password-123", error: "用户名需为 3–32 位字母、数字、下划线或短横线" },
    { username: "a".repeat(33), password: "test-password-123", error: "用户名需为 3–32 位字母、数字、下划线或短横线" },
    { username: "new_user", password: "  short-pass  ", error: "密码需为 12–128 个字符" },
    { username: "new_user", password: "a".repeat(129), error: "密码需为 12–128 个字符" }
  ])("blocks invalid registration credentials ($username, $password)", async ({ username, password, error }) => {
    submitForm(username, password);

    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("shows a duplicate username error and keeps the form available", async () => {
    register.mockRejectedValueOnce(new Error("注册失败: 用户名已存在"));
    submitForm();

    expect(await screen.findByText("注册失败: 用户名已存在")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("用户名")).toBeEnabled();
    expect(screen.getByRole("link", { name: "去登录" })).toHaveAttribute("href", "/login");
  });
});
