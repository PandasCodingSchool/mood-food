import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { HttpErrorFilter } from './common/http.js';
import { RateLimitGuard } from './common/rate-limit.js';
import { CoreModule } from './core/core.module.js';
import { DiyModule } from './diy/diy.module.js';
import { IntelligenceModule } from './intelligence/intelligence.service.js';
import { MiscModule } from './misc/misc.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { RecommendationsModule } from './recommendations/recommendations.module.js';
import { SignalsModule } from './signals/signals.module.js';
import { SocialModule } from './social/social.module.js';
import { SwiggyModule } from './swiggy/swiggy.module.js';

@Module({
  imports: [
    CoreModule,
    IntelligenceModule,
    AuthModule,
    ProfileModule,
    NotificationsModule,
    SignalsModule,
    RecommendationsModule,
    SwiggyModule,
    SocialModule,
    DiyModule,
    MiscModule,
  ],
  providers: [
    // Order matters: rate-limit before auth so floods never reach the session lookup.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
