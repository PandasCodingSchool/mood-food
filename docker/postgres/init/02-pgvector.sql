-- Runs once, on the first start of an empty volume. The intelligence service
-- also creates the extension on boot, so existing volumes are covered too.
CREATE EXTENSION IF NOT EXISTS vector;
\c moodfood_test
CREATE EXTENSION IF NOT EXISTS vector;
