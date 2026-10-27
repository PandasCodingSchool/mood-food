import { Module } from '@nestjs/common';
import { GroceryController } from './grocery.controller.js';
import { GroceryService } from './grocery.service.js';
import { KitchenCircleController } from './kitchen-circle.controller.js';
import { KitchenCircleService } from './kitchen-circle.service.js';
import { PlannerProfileAdapter } from './planner-profile.adapter.js';

@Module({
  controllers: [KitchenCircleController, GroceryController],
  providers: [KitchenCircleService, GroceryService, PlannerProfileAdapter],
  exports: [KitchenCircleService],
})
export class KitchenCircleModule {}
