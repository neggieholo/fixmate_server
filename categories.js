import express from "express";
import pool from "./db.js";

const router = express.Router();

/* ------------------------- TASK CATEGORIES ------------------------- */

// Create a task category
router.post("/task-categories", async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      "INSERT INTO task_categories (name) VALUES ($1) RETURNING *",
      [name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create task category" });
  }
});

// Get all task categories
router.get("/task-categories", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM task_categories ORDER BY name");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch task categories" });
  }
});


/* ------------------------- FETCH TASKS ------------------------- */

// Tasks for a specific asset type
router.get("/tasks/:asset_type_id", async (req, res) => {
  try {
    const { asset_type_id } = req.params;
    const result = await pool.query(
      `SELECT tc.name AS category, t.name, t.standard_value, t.unit, t.remarks
       FROM tasks t
       JOIN task_categories tc ON tc.id = t.task_category_id
       WHERE t.asset_type_id = $1
       ORDER BY tc.name, t.name`,
      [asset_type_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// Tasks for a specific asset
router.get("/assets/:asset_id/tasks", async (req, res) => {
  try {
    const { asset_id } = req.params;
    const result = await pool.query(
      `SELECT tc.id AS task_category_id, tc.name AS task_category,
              t.id AS task_id, t.name AS task_name, t.standard_value, t.unit, t.remarks
       FROM assets a
       JOIN asset_types at ON at.id = a.asset_type_id
       JOIN asset_type_task_categories atc ON atc.asset_type_id = at.id
       JOIN task_categories tc ON tc.id = atc.task_category_id
       JOIN tasks t ON t.asset_type_id = at.id AND t.task_category_id = tc.id
       WHERE a.id = $1
       ORDER BY tc.name, t.name`,
      [asset_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch asset tasks" });
  }
});

export default router;
