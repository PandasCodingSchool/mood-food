import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SwiggyModule } from '../swiggy/swiggy.module.js';
import { HistoryController } from './history.controller.js';
import { PreferencesController } from './preferences.controller.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [SwiggyModule, NotificationsModule],
  controllers: [UsersController, PreferencesController, HistoryController],
})
export class ProfileModule {}
