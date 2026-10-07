import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SignalsModule } from '../signals/signals.module.js';
import { ProxyController } from './proxy.controller.js';
import { SwiggyOAuthController } from './swiggy-oauth.controller.js';
import { SwiggyHistoryService } from './swiggy-history.service.js';
import { SwiggyTokensService } from './swiggy-tokens.service.js';

@Module({
  imports: [NotificationsModule, SignalsModule],
  controllers: [SwiggyOAuthController, ProxyController],
  providers: [SwiggyTokensService, SwiggyHistoryService],
  exports: [SwiggyTokensService, SwiggyHistoryService],
})
export class SwiggyModule {}
