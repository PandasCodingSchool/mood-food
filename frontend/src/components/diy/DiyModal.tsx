import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { getSavedAddressId, saveAddressId, fetchAddresses } from "../../services/swiggy";
import {
  matchIngredients,
  updateInstamartCart,
  checkoutInstamart,
  type MatchedIngredient,
  type InstamartProduct,
  type InstamartVariation,
} from "../../services/instamart";
import { generateRecipe, createDiySession, updateDiySession, type Recipe } from "../../services/diy";
import DiyRecipe from "./DiyRecipe";
import DiyCart from "./DiyCart";
import DiyCook from "./DiyCook";
import DiyWall from "./DiyWall";
import DiyProductSearchModal from "./DiyProductSearchModal";

export interface DiyTarget {
  dishName: string;
}

interface DiyModalProps {
  target: DiyTarget | null;
  onClose: () => void;
}

type Stage = "recipe" | "cart" | "cook" | "wall";

/** DIY cooking flow: recipe -> Instamart ingredient cart -> cook checklist -> wall photo. */
export default function DiyModal({ target, onClose }: DiyModalProps) {
  const [stage, setStage] = useState<Stage>("recipe");
  const [recipeLoading, setRecipeLoading] = useState(true);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  const [cartLoading, setCartLoading] = useState(true);
  const [matches, setMatches] = useState<MatchedIngredient[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [cartError, setCartError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [addressId, setAddressId] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [manualItems, setManualItems] = useState<MatchedIngredient[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const loadRecipe = useCallback(async () => {
    if (!target) return;
    setRecipeLoading(true);
    setRecipeError(null);
    const result = await generateRecipe(target.dishName, 2);
    setRecipeLoading(false);
    if (!result.success || !result.recipe) {
      setRecipeError(result.error || "Couldn't generate a recipe. Please try again.");
      return;
    }
    setRecipe(result.recipe);
    setStage("cart");
  }, [target]);

  const loadCart = useCallback(async () => {
    if (!recipe) return;
    setCartLoading(true);
    setCartError(null);

    const list = await fetchAddresses();
    let addrId = getSavedAddressId();
    if (!addrId && list.length > 0) {
      addrId = list[0].id;
      saveAddressId(addrId);
    }
    if (!addrId) {
      setCartError("Link a Swiggy address to build your ingredient cart.");
      setCartLoading(false);
      return;
    }
    setAddressId(addrId);

    const result = await matchIngredients(recipe.items, addrId);
    if (!result.success) {
      setCartError(result.error || "Could not search Instamart for these ingredients.");
      setCartLoading(false);
      return;
    }
    setMatches(result.matches);

    const session = await createDiySession(recipe.dish, recipe, result.matches, result.matches);
    if (session.success && session.id) setSessionId(session.id);
    setCartLoading(false);
  }, [recipe]);

  useEffect(() => {
    if (target) void loadRecipe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    if (stage === "cart" && recipe) void loadCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, recipe]);

  if (!target) return null;

  const toggleRemoved = (name: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const activeMatches = [
    ...matches.filter((m) => m.matched && m.variation && !removed.has(m.ingredient.name)),
    ...manualItems,
  ];

  const handleAddManual = (product: InstamartProduct, variation: InstamartVariation) => {
    setManualItems((prev) => [
      ...prev,
      {
        ingredient: { name: product.name, quantity: "1", unit: variation.quantity || "item" },
        matched: true,
        confidence: 100,
        product,
        variation,
      },
    ]);
  };

  const handleRemoveManual = (spinId: string) => {
    setManualItems((prev) => prev.filter((m) => m.variation?.spinId !== spinId));
  };

  const goToCook = async (status: "checked_out" | "cooking", orderId?: string) => {
    if (sessionId) {
      await updateDiySession(sessionId, {
        ingredientCart: activeMatches,
        status,
        ...(orderId ? { instamartOrderId: orderId } : {}),
      });
    }
    setCompletedSteps(new Set());
    setStage("cook");
  };

  const handleCheckout = async () => {
    if (!addressId || activeMatches.length === 0) return;
    setCheckingOut(true);
    setCartError(null);
    const items = activeMatches.map((m) => ({ spinId: m.variation!.spinId, skuId: m.variation!.skuId, quantity: 1 }));
    const cart = await updateInstamartCart(addressId, items);
    if (!cart.success) {
      setCartError(cart.error || "Could not build the Instamart cart.");
      setCheckingOut(false);
      return;
    }
    const result = await checkoutInstamart(addressId, undefined, true);
    setCheckingOut(false);
    if (!result.success) {
      setCartError(result.error || "Checkout failed. Please try again.");
      return;
    }
    await goToCook("checked_out", result.orderId || undefined);
  };

  const handleLetsCook = async () => {
    await goToCook("cooking");
  };

  const toggleStep = (index: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      if (sessionId) void updateDiySession(sessionId, { completedSteps: Array.from(next) });
      return next;
    });
  };

  const titles: Record<Stage, string> = {
    recipe: `👨‍🍳 DIY ${target.dishName}`,
    cart: `Ingredients — ${recipe?.dish || target.dishName}`,
    cook: `Cooking — ${recipe?.dish || target.dishName}`,
    wall: "Your wall",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4">
      <div className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900">{titles[stage]}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5">
          {stage === "recipe" && (
            <DiyRecipe dishName={target.dishName} loading={recipeLoading} error={recipeError} onRetry={loadRecipe} />
          )}
          {stage === "cart" && recipe && (
            <DiyCart
              loading={cartLoading}
              servings={recipe.servings}
              matches={matches}
              removed={removed}
              onToggleRemoved={toggleRemoved}
              manualItems={manualItems}
              onRemoveManual={handleRemoveManual}
              onOpenSearch={() => setSearchOpen(true)}
              error={cartError}
              checkingOut={checkingOut}
              onCheckout={handleCheckout}
              onLetsCook={handleLetsCook}
            />
          )}
          {stage === "cook" && recipe && (
            <DiyCook
              dishName={recipe.dish}
              steps={recipe.steps}
              completed={completedSteps}
              onToggleStep={toggleStep}
              onAddToWall={() => setStage("wall")}
            />
          )}
          {stage === "wall" && sessionId && (
            <DiyWall sessionId={sessionId} dishName={recipe?.dish || target.dishName} onDone={onClose} />
          )}
        </div>
      </div>
      {searchOpen && (
        <DiyProductSearchModal addressId={addressId} onClose={() => setSearchOpen(false)} onAdd={handleAddManual} />
      )}
    </div>
  );
}
