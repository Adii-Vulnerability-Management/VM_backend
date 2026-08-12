import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectConnection } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { RbacService } from './rbac.service';

@Injectable()
export class AccessExpiryJob {
  private readonly logger = new Logger(AccessExpiryJob.name);

  constructor(
    @InjectConnection() private readonly mongo: mongoose.Connection,
    private readonly rbacService: RbacService,
  ) {}

  @Cron('*/5 * * * *') // run every 5 minutes to activate/expire acccess windows
  async tick() {
    const now = new Date();

    // Find users whose schedules access should now become ACTIVE
    const toActivate = await this.mongo
      .collection('users')
      .find({
        accessWindows: {
          $elemMatch: {
            status: 'PENDING',
            startDate: { $lte: now },
            endDate: { $gt: now },
          },
        },
      })
      .toArray();

    for (const u of toActivate) {
      // Ensure accessWindow is always an array
      const windows = Array.isArray(u.accessWindows) ? u.accessWindows : [];

      // Filter windows ready for activation
      const activeWindows = windows.filter(
        (w: any) =>
          w?.status === 'PENDING' &&
          new Date(w.startDate) <= now &&
          new Date(w.endDate) > now,
      );

      if (!activeWindows.length) continue;

      // merge all windows becoming active
      const rolesToAdd = activeWindows.flatMap((w: any) => w.roles || []);
      const modulesToAdd = activeWindows.flatMap((w: any) => w.modules || []);

      await this.mongo.collection('users').updateOne(
        { _id: u._id },
        {
          $addToSet: {
            roles: { $each: rolesToAdd },
            modules: { $each: modulesToAdd },
          },
          $set: { updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
      );

      // mark those windows ACTIVE
      for (const w of activeWindows) w.status = 'ACTIVE';

      await this.mongo
        .collection('users')
        .updateOne(
          { _id: u._id },
          { $set: { accessWindows: windows, updatedAt: now } },
        );

      const email = (u.email || u.user_email || '').toLowerCase();
      if (email) await this.rbacService.refreshUserPermissionCache(email);

      this.logger.log(`Activated scheduled access for ${email || u._id}`);
    }

    // 2) Expire windows when endDate passes => remove access
    const toExpire = await this.mongo
      .collection('users')
      .find({
        accessWindows: {
          $elemMatch: {
            status: { $in: ['ACTIVE', 'PENDING'] },
            endDate: { $lte: now },
          },
        },
      })
      .toArray();

    for (const u of toExpire) {
      const windows = Array.isArray(u.accessWindows) ? u.accessWindows : [];

      const expiredWindows = windows.filter((w: any) => {
        const end = new Date(w?.endDate);
        return (
          (w?.status === 'ACTIVE' || w?.status === 'PENDING') && end <= now
        );
      });

      if (!expiredWindows.length) continue;

      const rolesToRemove = expiredWindows.flatMap((w: any) => w.roles || []);
      const modulesToRemove = expiredWindows.flatMap(
        (w: any) => w.modules || [],
      );

      // Remove roles/modules from user
      await this.mongo.collection('users').updateOne(
        { _id: u._id },
        {
          $pull: {
            roles: { $in: rolesToRemove },
            modules: { $in: modulesToRemove },
          },
          $set: { updatedAt: now },
        },
      );

      // Mark windows expired
      for (const w of expiredWindows) w.status = 'EXPIRED';

      await this.mongo
        .collection('users')
        .updateOne(
          { _id: u._id },
          { $set: { accessWindows: windows, updatedAt: now } },
        );

      const email = (u.email || u.user_email || '').toLowerCase();
      if (email) await this.rbacService.refreshUserPermissionCache(email);

      this.logger.log(`Expired access for ${email || u._id}`);
    }
  }
}
