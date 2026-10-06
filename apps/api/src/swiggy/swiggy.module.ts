import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProxyController } from './proxy.controller.js';
import { SwiggyOAuthController } from './swiggy-oauth.controller.js';
import { SwiggyTokensService } from './swiggy-tokens.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [SwiggyOAuthController, ProxyController],
  providers: [SwiggyTokensService],
  exports: [SwiggyTokensService],
})
export class SwiggyModule {}
