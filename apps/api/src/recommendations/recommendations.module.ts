import { Module } from '@nestjs/common';
import { SignalsModule } from '../signals/signals.module.js';
import { SwiggyModule } from '../swiggy/swiggy.module.js';
import { RecommendationsController } from './recommendations.controller.js';

@Module({ imports: [SwiggyModule, SignalsModule], controllers: [RecommendationsController] })
export class RecommendationsModule {}
