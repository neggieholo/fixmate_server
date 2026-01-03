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

    // Check for existing category
    const existing = await client.query(
      "SELECT id FROM task_categories WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [name.trim()]
    );

    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Task category with this name already exists" });
    }

    // Insert the task category
    const result = await client.query(
      "INSERT INTO task_categories (name) VALUES ($1) RETURNING id",
      [name.trim()]
    );
    const taskCategoryId = result.rows[0].id;

    // Batch insert subcategories
    if (subcategory_ids.length > 0) {
      const placeholders = subcategory_ids
        .map((_, idx) => `($1, $${idx + 2})`)
        .join(", ");
      const values = [taskCategoryId, ...subcategory_ids];

      await client.query(
        `INSERT INTO subcategory_task_categories (task_category_id, subcategory_id) VALUES ${placeholders}`,
        values
      );
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

/* ---------------- GET TASK CATEGORIES BY ASSET TYPE ---------------- */
router.get("/by_sub_assetType", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const assetTypeId = Number(req.query.assetTypeId);
  const subcategoryId = Number(req.query.subcategoryId);

  try {
    let rows;

    if (assetTypeId) {
      console.log("Fetching task categories by asset type ID:", assetTypeId);

      const result = await pool.query(
        `
        SELECT
          tc.id,
          tc.name,
          COUNT(st.id) AS task_count
        FROM asset_types at
        JOIN subcategory_task_categories stc
          ON stc.subcategory_id = at.subcategory_id
        JOIN task_categories tc
          ON tc.id = stc.task_category_id
        LEFT JOIN suggested_tasks st
          ON st.task_category_id = tc.id
         AND st.asset_type_id = at.id
        WHERE at.id = $1
        GROUP BY tc.id, tc.name
        ORDER BY tc.name
        `,
        [assetTypeId]
      );

      rows = result.rows;
    } else if (subcategoryId) {
      console.log("Fetching task categories by subcategory ID:", subcategoryId);

      const result = await pool.query(
        `
        SELECT
          tc.id,
          tc.name
        FROM subcategory_task_categories stc
        JOIN task_categories tc
          ON tc.id = stc.task_category_id
        WHERE stc.subcategory_id = $1
        ORDER BY tc.name
        `,
        [subcategoryId]
      );

      rows = result.rows; // no task counts here
    } else {
      return res.status(400).json({ error: "Please provide assetTypeId or subcategoryId" });
    }

    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch task categories:", err);
    res.status(500).json({ error: "Failed to fetch task categories" });
  }
});




export default router;
