import { Module } from '@nestjs/common';
import { SignalsModule } from '../signals/signals.module.js';
import { SwiggyModule } from '../swiggy/swiggy.module.js';
import { GamesController } from './games.controller.js';

@Module({ imports: [SignalsModule, SwiggyModule], controllers: [GamesController] })
export class GamesModule {}
