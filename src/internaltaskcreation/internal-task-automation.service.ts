import { Injectable, Logger } from '@nestjs/common';

/**
 * Stub replacement for the internal task-automation service that exists in
 * the full GRC monorepo. This VM-only backend slice doesn't include the
 * internal ticketing module, so remediation task auto-creation is a no-op
 * here. Callers already treat a null/failed result as non-fatal.
 */
@Injectable()
export class InternalTaskAutomationService {
  private readonly logger = new Logger(InternalTaskAutomationService.name);

  async autoCreateFromSource(_params: {
    sourceType: string;
    source: any;
    createdByUserId: string;
    assignToUserId?: string;
  }): Promise<{ _id: string } | null> {
    this.logger.debug(
      'internal task automation is not available in this backend slice; skipping task creation',
    );
    return null;
  }
}
