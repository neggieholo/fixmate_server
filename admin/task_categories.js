import express from "express";
import pool from "../db.js";

const router = express.Router();

// POST /api/subcategory_task_categories
router.post("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { name, subcategory_ids } = req.body;

  if (!name?.trim() || !Array.isArray(subcategory_ids)) {
    return res.status(400).json({ error: "Invalid data" });
  }
  

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id FROM task_categories WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [name.trim()]
    );

    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Task category with this name already exists"
      });
    }

    const result = await client.query(
      "INSERT INTO task_categories (name) VALUES ($1) RETURNING id",
      [name.trim()]
    );

    const taskCategoryId = result.rows[0].id;

    const insertQuery =
      "INSERT INTO subcategory_task_categories (task_category_id, subcategory_id) VALUES ($1, $2)";

    for (const subId of subcategory_ids) {
      await client.query(insertQuery, [taskCategoryId, subId]);
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      taskcategory: {
        id: taskCategoryId,
        name: name.trim(),
        subcategory_ids
      }
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to save task category" });
  } finally {
    client.release();
  }
});



/* ---------------- GET ALL TASK CATEGORIES ---------------- */
// Returns all task categories with their associated subcategory IDs
router.get("/", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const taskCategoriesRes = await pool.query("SELECT * FROM task_categories ORDER BY name");
    const taskCategories = taskCategoriesRes.rows;

    // Get all subcategory links
    const linksRes = await pool.query("SELECT * FROM subcategory_task_categories");
    const links = linksRes.rows;

    // Map subcategory IDs to each task category
    const result = taskCategories.map(tc => ({
      ...tc,
      subcategory_ids: links
        .filter(l => l.task_category_id === tc.id)
        .map(l => l.subcategory_id)
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch task categories" });
  }
});

/* ---------------- UPDATE TASK CATEGORY NAME ---------------- */
router.patch("/:id", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { id } = req.params;
    const { name } = req.body;
    console.log('Updating task category id:', id, 'to name:', name);
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const updatedRes = await pool.query(
      "UPDATE task_categories SET name = $1 WHERE id = $2 RETURNING *",
      [name.trim(), id]
    );

    if (updatedRes.rowCount === 0) return res.status(404).json({ error: "Task category not found" });

    res.json(updatedRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update task category" });
  }
});

/* ---------------- DELETE TASK CATEGORY ---------------- */
router.delete("/:id", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { id } = req.params;

    // Delete junction table entries first (optional if cascade exists)
    await pool.query("DELETE FROM subcategory_task_categories WHERE task_category_id = $1", [id]);

    // Delete task category itself
    const deleteRes = await pool.query("DELETE FROM task_categories WHERE id = $1 RETURNING *", [id]);

    if (deleteRes.rowCount === 0) return res.status(404).json({ error: "Task category not found" });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete task category" });
  }
});

export default router;
