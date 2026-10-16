-- What an ordered Swiggy item *is* (cuisine, protein, form, spice, heaviness),
-- whether or not it maps to a catalog dish. Keyed by normalised item name.
CREATE TABLE IF NOT EXISTS item_profiles (
    item_key TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    method TEXT NOT NULL,               -- jev | catalog | rules
    updated_at TIMESTAMPTZ DEFAULT now()
);
