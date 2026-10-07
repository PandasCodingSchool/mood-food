-- Food graph: Swiggy menu item name -> canonical dish (or a cached "no match").
-- Grows with every enrichment, scout verdict and order-history import.
CREATE TABLE IF NOT EXISTS menu_item_map (
    item_key TEXT PRIMARY KEY,          -- normalised item name
    item_name TEXT NOT NULL,
    dish_id TEXT,                       -- NULL = verified "not any catalog dish"
    confidence DOUBLE PRECISION NOT NULL,
    method TEXT NOT NULL,               -- exact | jev | scout | unverified
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_item_map_dish ON menu_item_map (dish_id);
