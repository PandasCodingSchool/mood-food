import { type CanActivate, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { ENV } from '../core/tokens.js';

/**
 * `KITCHEN_CIRCLE_ENABLED=false` makes every KitchenCircle route answer 404, as if the feature didn't exist,
 * so it can be switched off without touching MoodFood.
 */
@Injectable()
export class KitchenCircleEnabledGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(): boolean {
    if (!this.env.KITCHEN_CIRCLE_ENABLED) throw new NotFoundException();
    return true;
  }
}
