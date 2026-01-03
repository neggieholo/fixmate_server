import express from "express";
import pool from "../db.js";

const router = express.Router();

/* ---------------- CREATE TASK ---------------- */
router.post("/", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { asset_type_ids, task_category_id, name, standard_value, unit, remarks } = req.body;

  if (!asset_type_ids || !asset_type_ids.length || !task_category_id || !name) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let existingTasks = [];

  try {
    const createdTasks = [];

    for (const asset_type_id of asset_type_ids) {
      // Check if task already exists for this asset type and category
      const existing = await pool.query(
        `SELECT id FROM suggested_tasks 
         WHERE asset_type_id = $1 AND task_category_id = $2 AND name = $3`,
        [asset_type_id, task_category_id, name]
      );

      if (existing.rows.length > 0) {
        existingTasks.push(existing.rows[0]);
        continue;
      }

      // Insert new task
      const result = await pool.query(
        `INSERT INTO suggested_tasks 
          (asset_type_id, task_category_id, name, standard_value, unit, remarks) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [
          asset_type_id,
          task_category_id,
          name,
          standard_value || null,
          unit || null,
          remarks || null
        ]
      );

      createdTasks.push(result.rows[0]);
    }

    if (!createdTasks.length) {
      return res.status(409).json({ error: "Task already exists for all selected asset types" });
    }

    res.status(201).json({ createdTasks, existingTasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create task" });
  }
});


/* ---------------- GET ALL TASKS ---------------- */
router.get("/", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await pool.query("SELECT * FROM suggested_tasks ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

/* ---------------- GET SINGLE TASK ---------------- */
router.get("/:id", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM suggested_tasks WHERE id = $1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Task not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch task" });
  }
});

/* ---------------- UPDATE TASK ---------------- */
router.patch("/:id", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  const { asset_type_id, task_category_id, name, standard_value, unit, remarks } = req.body;

  if (!asset_type_id && !task_category_id && !name && !standard_value && !unit && !remarks) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    const existing = await pool.query("SELECT * FROM suggested_tasks WHERE id = $1", [id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: "Task not found" });

    const task = existing.rows[0];

    const updated = await pool.query(
      `UPDATE suggested_tasks SET 
        asset_type_id = $1,
        task_category_id = $2,
        name = $3,
        standard_value = $4,
        unit = $5,
        remarks = $6
       WHERE id = $7
       RETURNING *`,
      [
        asset_type_id ?? task.asset_type_id,
        task_category_id ?? task.task_category_id,
        name?.trim() ?? task.name,
        standard_value?.trim() ?? task.standard_value,
        unit?.trim() ?? task.unit,
        remarks?.trim() ?? task.remarks,
        id
      ]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

/* ---------------- DELETE TASK ---------------- */
router.delete("/:id", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;

  try {
    const result = await pool.query("DELETE FROM suggested_tasks WHERE id = $1 RETURNING *", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Task not found" });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// GET /api/suggested_tasks/by-task-category/:taskCategoryId
// POST /api/suggested_tasks/by-asset-type/:assetTypeId/task-category/:taskCategoryId
// GET /api/suggested_tasks/by-asset-type/:assetTypeId/task-category/:taskCategoryId
router.get(
  "/by-asset-type/:assetTypeId/task-category/:taskCategoryId",
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    console.log('suggested tasks api hit')

    const { assetTypeId, taskCategoryId } = req.params;

    if (!assetTypeId || isNaN(Number(assetTypeId))) {
      return res.status(400).json({ error: "Invalid asset type ID" });
    }
    if (!taskCategoryId || isNaN(Number(taskCategoryId))) {
      return res.status(400).json({ error: "Invalid task category ID" });
    }

    try {
      const result = await pool.query(
        `SELECT *
         FROM suggested_tasks
         WHERE asset_type_id = $1
           AND task_category_id = $2
         ORDER BY id ASC`,
        [assetTypeId, taskCategoryId]
      );

      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch suggested tasks" });
    }
  }
);




export default router;
