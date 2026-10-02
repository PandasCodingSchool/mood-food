-- Runs once, on the first start of an empty volume.
-- A separate database for automated tests so they never touch dev data.
CREATE DATABASE moodfood_test OWNER moodfood;
