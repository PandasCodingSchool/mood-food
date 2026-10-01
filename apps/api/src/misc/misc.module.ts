import { Module } from '@nestjs/common';
import { AdminPageController, AnalyticsController } from './analytics.controller.js';
import { ContextController } from './context.controller.js';
import { HealthController } from './health.controller.js';

@Module({ controllers: [HealthController, ContextController, AnalyticsController, AdminPageController] })
export class MiscModule {}
