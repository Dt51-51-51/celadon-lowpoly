CREATE TABLE model_stats(version_id TEXT PRIMARY KEY,triangles INTEGER NOT NULL,updated_at INTEGER NOT NULL);
INSERT OR IGNORE INTO catalog_recipe_metadata(recipe_id,recipe_version,model_type,style_id) VALUES ('hydrangea','1.0.0','Nature',NULL),('mushroom-cluster','2.0.0','Nature',NULL),('windmill','2.0.0','Buildings',NULL);
