import express from "express";
import pool from "../db.js";

const router = express.Router();

// Create asset type
router.post("/", async (req, res) => {
    if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { subcategory_id, name } = req.body;

    if (!subcategory_id || !name) {
      return res.status(400).json({ error: "subcategory_id and name are required" });
    }

    // Check if asset type already exists in this subcategory
    const exists = await pool.query(
      "SELECT 1 FROM asset_types WHERE subcategory_id = $1 AND name = $2 LIMIT 1",
      [subcategory_id, name]
    );

    if (exists.rowCount > 0) {
      return res.status(409).json({
        error: "Asset type already exists for this subcategory"
      });
    }

    const result = await pool.query(
      "INSERT INTO asset_types (subcategory_id, name) VALUES ($1, $2) RETURNING *",
      [subcategory_id, name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create asset type" });
  }
});

// Get all asset types (optionally filter by subcategory_id)
router.get("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { subcategory_id } = req.query;
    let result;
    if (subcategory_id) {
      result = await pool.query(
        "SELECT * FROM asset_types WHERE subcategory_id = $1 ORDER BY name",
        [subcategory_id]
      );
    } else {
      result = await pool.query("SELECT * FROM asset_types ORDER BY name");
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch asset types" });
  }
});

// Update asset type
router.patch("/:id", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const result = await pool.query(
      "UPDATE asset_types SET name = $1 WHERE id = $2 RETURNING *",
      [name, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Asset type not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update asset type" });
  }
});

// Delete asset type
router.delete("/:id", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM asset_types WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Asset type not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);

    // Optional: FK safety (if tasks/assets depend on this type)
    if (err.code === "23503") {
      return res.status(409).json({
        error: "Asset type is in use and cannot be deleted"
      });
    }

    res.status(500).json({ error: "Failed to delete asset type" });
  }
});

router.get("/by-subcategory/:subcategoryId", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { subcategoryId } = req.params;

    if (!subcategoryId) {
      return res.status(400).json({ error: "Subcategory ID is required" });
    }

    const result = await pool.query(
      "SELECT * FROM asset_types WHERE subcategory_id = $1 ORDER BY name",
      [subcategoryId]
    );

    res.json({ success: true, assetTypes: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch asset types" });
  }
});

export default router;