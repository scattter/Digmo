import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSinaFundEstimate } from "../sina-fund-client.js";

function payload(estimate: Record<number, string> = {}, nav: Record<number, string> = {}) {
  const estimateFields = ["Fund", "14:22:00", "1.9354", "1.9863", "2.0", "0", "-2.57", "2026-03-17", "", ""];
  const navFields = ["Fund", "1.9863", "2.0", "2.0064", "-1", "2026-03-16"];
  for (const [index, value] of Object.entries(estimate)) estimateFields[Number(index)] = value;
  for (const [index, value] of Object.entries(nav)) navFields[Number(index)] = value;
  return 'var hq_str_fu_023638="' + estimateFields.join(",") + '";\nvar hq_str_of023638="' + navFields.join(",") + '";';
}

describe("Sina fund estimates", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("uses Sina's displayed fields, converts percentage points and sends the required referer", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(payload({ 8: "9", 9: "99" })));
    expect(await fetchSinaFundEstimate("023638")).toEqual({
      fundCode: "023638", fundName: "Fund", officialNav: 1.9863, officialDailyReturn: -0.01,
      estimateNav: 1.9354, estimateChangePct: -0.0257, baseNavDate: "2026-03-16",
      quoteTime: "2026-03-17T14:22:00+08:00"
    });
    expect(request).toHaveBeenCalledWith("https://hq.sinajs.cn/list=fu_023638,of023638", expect.objectContaining({
      headers: expect.objectContaining({ Referer: "https://finance.sina.com.cn/" }),
      redirect: "error", signal: expect.any(AbortSignal)
    }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("decodes GB18030 Chinese names", async () => {
    const body = Buffer.concat([
      Buffer.from(payload().split("Fund")[0]), Buffer.from("b2e2cad4bbf9bdf0", "hex"),
      Buffer.from(payload().slice(payload().indexOf("Fund") + 4))
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
    expect((await fetchSinaFundEstimate("023638"))?.fundName).toBe("测试基金");
  });

  it.each([
    [0, ""], [2, ""], [2, "0"], [2, "-1"], [3, ""], [3, "0"], [3, "NaN"],
    [6, ""], [6, "Infinity"], [6, "NaN"], [6, "60"], [7, "2026-02-29"], [7, "2026-13-01"],
    [1, ""], [1, "24:00"], [1, "14:60"], [1, "14:22:60"]
  ])("rejects invalid estimate field %s = %s", async (field, value) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(payload({ [field]: value })));
    expect(await fetchSinaFundEstimate("023638")).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves a zero return", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(payload({ 2: "1.9863", 6: "-0" })));
    expect((await fetchSinaFundEstimate("023638"))?.estimateChangePct).toBe(0);
  });

  it("allows independently rounded NAV and percentage values for high NAV funds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(payload({ 2: "10.0006", 3: "10", 6: "0.01" }, { 1: "10" })));
    expect(await fetchSinaFundEstimate("023638")).toMatchObject({ estimateNav: 10.0006, estimateChangePct: 0.0001 });
  });

  it.each(["<html>页面未找到</html>", 'var hq_str_fu_023638="";', payload().replaceAll("023638", "020273")])(
    "rejects HTML, unsupported funds and another fund's data", async (text) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(text));
      expect(await fetchSinaFundEstimate("023638")).toBeUndefined();
    }
  );

  it("finds the actual baseline date when published NAV has already rolled forward", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(payload({}, { 1: "1.9354", 5: "2026-03-17" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Data: { LSJZList: [
        { FSRQ: "2026-03-17", DWJZ: "1.9354", JZZZL: "-2.56" },
        { FSRQ: "2026-03-16", DWJZ: "1.9863", JZZZL: "-1.2" }
      ] } })));
    expect(await fetchSinaFundEstimate("023638")).toMatchObject({
      baseNavDate: "2026-03-16", officialNav: 1.9863, officialDailyReturn: -0.012
    });
    expect(String(request.mock.calls[1]?.[0])).toContain("/f10/lsjz?fundCode=023638");
  });

  it("never assigns an unverified NAV date after a baseline mismatch", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(payload({}, { 1: "8" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Data: { LSJZList: [
        { FSRQ: "2026-03-16", DWJZ: "8", JZZZL: "0" }
      ] } })));
    expect(await fetchSinaFundEstimate("023638")).toBeUndefined();
  });

  it("does not turn a missing official return into zero", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(payload({}, { 4: "--" })));
    expect((await fetchSinaFundEstimate("023638"))?.officialDailyReturn).toBeUndefined();
  });

  it("rejects oversized upstream bodies", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(" ".repeat(33 * 1024) + payload()));
    expect(await fetchSinaFundEstimate("023638")).toBeUndefined();
  });

  it("aborts a stalled response body, including after headers arrive", async () => {
    let signal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      signal = init?.signal;
      return new Response(new ReadableStream({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
        }
      }));
    });
    const result = fetchSinaFundEstimate("023638");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toBeUndefined();
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its deadline after network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection failed"));
    expect(await fetchSinaFundEstimate("023638")).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects invalid fund codes before making a request", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    expect(await fetchSinaFundEstimate("023638,of000001")).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });
});
