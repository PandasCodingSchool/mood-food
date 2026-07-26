import { useEffect, useState } from "react";
import { fetchTwinTaste } from "../services/signals";

// 3.7 — Twin taste matching: light social proof without a social graph.
// Surfaces aggregates only ("people like you"), never named individuals.
function TwinTasteSection() {
  const [dishes, setDishes] = useState<Array<{ dishId: string; dishName: string; lovedBy: number }>>([]);

  useEffect(() => {
    fetchTwinTaste().then((res) => setDishes(res.dishes));
  }, []);

  if (dishes.length === 0) return null;

  return (
    <div className="max-w-2xl mx-auto mt-2 mb-6">
      <p className="text-xs font-black text-gray-500 mb-2">👥 People like you are loving</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {dishes.map((d) => (
          <div
            key={d.dishId}
            className="shrink-0 min-w-[140px] px-3.5 py-2.5 rounded-xl bg-white border border-gray-100"
          >
            <p className="text-sm font-extrabold text-gray-900 truncate">{d.dishName}</p>
            <p className="text-[11px] text-gray-400 font-semibold mt-0.5">
              Loved by {d.lovedBy} similar tastes
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TwinTasteSection;
