import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SwiggyModule } from '../swiggy/swiggy.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { ChatController } from './chat.controller.js';
import { CookController } from './cook.controller.js';
import { CookService } from './cook.service.js';
import { FeedbackService } from './feedback.service.js';
import { KitchenCircleMetricsService } from './metrics.service.js';
import { PlannerNotifierService } from './planner-notifier.service.js';
import { ChatService } from './chat.service.js';
import { GroceryController } from './grocery.controller.js';
import { HouseholdController, KitchenCircleStatusController } from './household.controller.js';
import { HouseholdService } from './household.service.js';
import { GroceryService } from './grocery.service.js';
import { KitchenCircleController } from './kitchen-circle.controller.js';
import { KitchenCircleService } from './kitchen-circle.service.js';
import { PlannerProfileAdapter } from './planner-profile.adapter.js';
import { PlannerController } from './planner.controller.js';
import { PlannerService } from './planner.service.js';
import { RecipeAssistController } from './recipe-assist.controller.js';
import { RecipeAssistService } from './recipe-assist.service.js';

@Module({
  imports: [SwiggyModule, NotificationsModule],
  controllers: [KitchenCircleController, GroceryController, PlannerController, ChatController, CartController, CookController, HouseholdController, KitchenCircleStatusController, RecipeAssistController],
  providers: [KitchenCircleService, GroceryService, PlannerService, ChatService, CartService, CookService, FeedbackService, KitchenCircleMetricsService, PlannerNotifierService, HouseholdService, RecipeAssistService, PlannerProfileAdapter],
  exports: [KitchenCircleService],
})
export class KitchenCircleModule {}
