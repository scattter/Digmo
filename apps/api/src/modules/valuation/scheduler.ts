import { isTradingTime, nowInShanghai } from "../../utils/time.js";
import { ValuationTaskRunner } from "./task.js";

export class ValuationScheduler {
  private readonly runner: ValuationTaskRunner;

  private timer?: NodeJS.Timeout;

  private lastOffHoursRunAt = 0;

  constructor(runner: ValuationTaskRunner) {
    this.runner = runner;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);

    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async tick(): Promise<void> {
    const now = nowInShanghai();

    if (isTradingTime(now)) {
      await this.runner.runTick(now);
      return;
    }

    if (now.getTime() - this.lastOffHoursRunAt >= 30 * 60 * 1000) {
      this.lastOffHoursRunAt = now.getTime();
      await this.runner.runTick(now);
    }
  }
}
