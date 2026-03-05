import { ERROR_CODES } from "@digmo/shared";
import { LockProvider } from "../../infra/lock/lock";
import { Repository } from "../../infra/repo/repository";
import { AppError } from "../../utils/app-error";
import { floorToBucketIso, getBucketSeconds, nowInShanghai } from "../../utils/time";
import { ValuationService } from "./service";

interface LoggerLike {
  info: (payload: unknown, message?: string) => void;
  warn: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
}

interface ValuationTaskRunnerDeps {
  service: ValuationService;
  repository: Repository;
  lock: LockProvider;
  logger: LoggerLike;
}

function resolveReason(error: unknown): string {
  if (error instanceof AppError) {
    return error.code;
  }
  return ERROR_CODES.INTERNAL_ERROR;
}

export class ValuationTaskRunner {
  private readonly service: ValuationService;

  private readonly repository: Repository;

  private readonly lock: LockProvider;

  private readonly logger: LoggerLike;

  constructor(deps: ValuationTaskRunnerDeps) {
    this.service = deps.service;
    this.repository = deps.repository;
    this.lock = deps.lock;
    this.logger = deps.logger;
  }

  async runTick(now: Date = nowInShanghai()): Promise<void> {
    const lockHandle = await this.lock.acquire("task_lock:valuation_tick", 30_000);
    if (!lockHandle) {
      this.logger.warn({ at: now.toISOString() }, "valuation tick skipped due to lock contention");
      return;
    }

    const startedAt = now.toISOString();
    const jobRun = await this.repository.startJobRun("valuation_tick", startedAt);

    let successCount = 0;
    let failCount = 0;
    const errors: Record<string, number> = {};

    try {
      const fundCodes = await this.service.listTargetFunds();
      const bucketIso = floorToBucketIso(now, getBucketSeconds(now));

      for (const fundCode of fundCodes) {
        try {
          await this.service.computeAndPersist(fundCode, {
            now,
            bucketIso,
            skipIfExists: true
          });
          successCount += 1;
        } catch (error) {
          failCount += 1;
          const reason = resolveReason(error);
          errors[reason] = (errors[reason] ?? 0) + 1;
          this.logger.error(
            {
              fundCode,
              reason,
              error
            },
            "valuation calculation failed"
          );
        }
      }
    } finally {
      const status = failCount === 0 ? "SUCCESS" : successCount > 0 ? "PARTIAL" : "FAILED";
      await this.repository.finishJobRun(jobRun.id, nowInShanghai().toISOString(), status, successCount, failCount, errors);
      await lockHandle.release();
    }
  }
}
