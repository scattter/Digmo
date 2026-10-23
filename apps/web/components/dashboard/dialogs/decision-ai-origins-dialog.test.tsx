import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecisionAiOriginsDialog } from "./decision-ai-origins-dialog";

vi.mock("@/lib/auth-session", () => ({ getAccessToken: () => "test-token" }));

beforeEach(() => {
  const getComputedStyle = window.getComputedStyle.bind(window);
  // JSDOM 不支持弹窗滚动条测量使用的伪元素样式。
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function response(allowedOrigins: string[]) {
  return new Response(JSON.stringify({ allowedOrigins, enforced: true }), { status: 200 });
}

describe("AI service allowlist dialog", () => {
  it("loads only when opened and submits edited origins with authentication", async () => {
    const origins = ["https://compat.example.com", "https://second.example.com:8443"];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(["https://api.openai.com"]))
      .mockResolvedValueOnce(response(origins));
    vi.stubGlobal("fetch", fetchMock);
    const onOpenChange = vi.fn();
    const { rerender } = render(<App><DecisionAiOriginsDialog open={false} onOpenChange={onOpenChange} /></App>);
    expect(fetchMock).not.toHaveBeenCalled();
    rerender(<App><DecisionAiOriginsDialog open onOpenChange={onOpenChange} /></App>);
    const input = screen.getByLabelText("允许调用的服务地址");
    await waitFor(() => expect(input).toHaveValue("https://api.openai.com"));
    fireEvent.change(input, { target: { value: " https://compat.example.com \n\nhttps://second.example.com:8443\n" } });
    fireEvent.click(screen.getByRole("button", { name: "保存白名单" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/settings/decision-ai/allowed-origins", expect.objectContaining({
      method: "PUT", body: JSON.stringify({ allowedOrigins: origins }),
    }));
    for (const [, options] of fetchMock.mock.calls) {
      expect(new Headers(options.headers).get("authorization")).toBe("Bearer test-token");
    }
  });

  it("prevents an accidental overwrite when the current list cannot be loaded", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("读取白名单失败"));
    vi.stubGlobal("fetch", fetchMock);
    render(<App><DecisionAiOriginsDialog open onOpenChange={vi.fn()} /></App>);
    expect(await screen.findByText("读取白名单失败")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存白名单" })).toBeDisabled();
    expect(screen.getByLabelText("允许调用的服务地址")).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps rejected edits available and supports retrying with an explicitly empty list", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(["https://api.openai.com"]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "INVALID_DECISION_AI_CONFIG", message: "白名单地址不能包含 /v1 等路径" }), { status: 400 }))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetchMock);
    const onOpenChange = vi.fn();
    render(<App><DecisionAiOriginsDialog open onOpenChange={onOpenChange} /></App>);
    const input = screen.getByLabelText("允许调用的服务地址");
    await waitFor(() => expect(input).toHaveValue("https://api.openai.com"));
    fireEvent.change(input, { target: { value: "https://compat.example.com/v1" } });
    fireEvent.click(screen.getByRole("button", { name: "保存白名单" }));
    expect(await screen.findByText("保存 AI 服务白名单失败: 白名单地址不能包含 /v1 等路径")).toBeInTheDocument();
    expect(input).toHaveValue("https://compat.example.com/v1");
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "\n  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存白名单" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/settings/decision-ai/allowed-origins", expect.objectContaining({
      method: "PUT", body: JSON.stringify({ allowedOrigins: [] }),
    }));
  });
});
