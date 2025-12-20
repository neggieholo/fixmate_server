import express from "express";
import pool from "../db.js";

const router = express.Router();


router.post("/", async (req, res) => {
  if (!req.user) {
    console.log('unauthorizes asset_categories post')
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { name } = req.body;

    const exists = await pool.query(
      "SELECT 1 FROM asset_categories WHERE name = $1",
      [name]
    );

    if (exists.rows.length > 0) {
      return res.status(409).json({ error: "Category already exists" });
    }

    const result = await pool.query(
      "INSERT INTO asset_categories (name) VALUES ($1) RETURNING *",
      [name]
    );
    res.json({success: true , category: result.rows[0]});
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to create asset category" });
  }
});

// Get all asset categories
router.get("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await pool.query("SELECT * FROM asset_categories ORDER BY name");
    res.json({success: true, categories: result.rows});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch asset categories" });
  }
});

// Edit asset category name
router.patch("/:id", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!req.user) {
    console.log("unauthorized asset_categories edit");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }

    // Check if the new name already exists (avoid duplicates)
    const exists = await pool.query(
      "SELECT 1 FROM asset_categories WHERE name = $1 AND id <> $2",
      [name, id]
    );

    if (exists.rows.length > 0) {
      return res.status(409).json({ error: "Category already exists" });
    }

    const result = await pool.query(
      "UPDATE asset_categories SET name = $1 WHERE id = $2 RETURNING *",
      [name, id]
    );

    res.json({ success: true, category: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to update asset category" });
  }
});


// Delete asset category
router.delete("/:id", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM asset_categories WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json({ success: true, category: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to delete asset category" });
  }
});


export default router;