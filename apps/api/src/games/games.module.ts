import { Module } from '@nestjs/common';
import { SignalsModule } from '../signals/signals.module.js';
import { GamesController } from './games.controller.js';

@Module({ imports: [SignalsModule], controllers: [GamesController] })
export class GamesModule {}
