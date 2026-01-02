import express from "express";
import pool from "../db.js";

const router = express.Router();


// Create subcategory
router.post("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { category_id, name } = req.body;
    const result = await pool.query(
      "INSERT INTO asset_subcategories (category_id, name) VALUES ($1, $2) RETURNING *",
      [category_id, name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create asset subcategory" });
  }
});

// Get all subcategories (optionally filter by category_id)
// Get all subcategories
router.get("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await pool.query(
      "SELECT * FROM asset_subcategories ORDER BY category_id, name"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch asset subcategories" });
  }
});


// Update subcategory
router.patch("/:id", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Subcategory name is required" });
    }

    const result = await pool.query(
      "UPDATE asset_subcategories SET name = $1 WHERE id = $2 RETURNING *",
      [name.trim(), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Subcategory not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update asset subcategory" });
  }
});


// Delete subcategory
router.delete("/:id", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM asset_subcategories WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Subcategory not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete asset subcategory" });
  }
});

// Get subcategories by category_id
router.get("/by-category/:categoryId", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return res.status(400).json({ error: "categoryId parameter is required" });
    }

    const result = await pool.query(
      "SELECT * FROM asset_subcategories WHERE category_id = $1 ORDER BY name",
      [categoryId]
    );

    res.json({ success: true, subcategories: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subcategories" });
  }
});


export default router;