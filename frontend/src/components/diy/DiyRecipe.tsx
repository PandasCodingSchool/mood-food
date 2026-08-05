import { Loader2 } from "lucide-react";

interface DiyRecipeProps {
  dishName: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/** Stage 1 — generating the recipe (ingredients + steps) for the chosen dish. */
export default function DiyRecipe({ dishName, loading, error, onRetry }: DiyRecipeProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
      {loading ? (
        <>
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-green-300 flex items-center justify-center text-3xl">
            🍳
          </div>
          <Loader2 className="w-5 h-5 text-green-600 animate-spin" />
          <p className="text-sm font-bold text-gray-500">Whipping up a recipe for {dishName}…</p>
        </>
      ) : (
        <>
          <span className="text-4xl">😕</span>
          <p className="text-sm font-bold text-gray-500">{error}</p>
          <button
            onClick={onRetry}
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-green-600 to-green-400 text-white font-bold text-sm"
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
