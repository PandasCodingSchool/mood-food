import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SignalsModule } from '../signals/signals.module.js';
import { GroupsController } from './groups.controller.js';
import { QuestsController } from './quests.controller.js';

@Module({
  imports: [SignalsModule, NotificationsModule],
  controllers: [QuestsController, GroupsController],
})
export class SocialModule {}
