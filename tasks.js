import express from "express";
import pool from "./db.js";

const router = express.Router();


router.get("/", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const user_id = req.user.id;

        const result = await pool.query(
            `
            SELECT 
                t.*, 
                a.name AS asset_name,
                a.model AS asset_model,
                s.schedule_name
            FROM maintenance_tasks t
            LEFT JOIN assets a ON t.asset_id = a.id
            LEFT JOIN maintenance_schedules s ON t.schedule_id = s.id
            WHERE a.user_id = $1
            ORDER BY t.updated_at DESC
            `,
            [user_id]
        );

        res.status(200).json({
            message: "✅ Tasks fetched successfully",
            tasks: result.rows,
        });
    } catch (err) {
        console.error("❌ Error fetching tasks:", err);
        res.status(500).json({ error: "Server error fetching tasks" });
    }
});

// POST /tasks/:id/skip
router.post("/:id/skip", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    console.log("Task skip/activate request received");

    const taskId = parseInt(req.params.id);
    const { action } = req.body; // 'skip' or 'activate'

    // 1️⃣ Fetch task
    const taskResult = await pool.query(
      `SELECT * FROM maintenance_tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const task = taskResult.rows[0];
    const now = new Date();
    const scheduled = new Date(task.scheduled_date);

    // 2️⃣ Handle standalone task (no schedule_id)
    if (!task.schedule_id) {
      if (action === "skip") {
        // Delete standalone task
        const deleted = await pool.query(
          `DELETE FROM maintenance_tasks WHERE id = $1 RETURNING *`,
          [taskId]
        );
        return res.json({ message: "Task deleted", task: deleted.rows[0] });
      }
      // For activate, just return as standalone tasks are manual
      return res.status(400).json({ error: "Standalone task cannot be activated/skipped" });
    }

    // 3️⃣ Handle scheduled task
    let newStatus = "active";

    if (action === "skip") {
      newStatus = "skipped";
    } else if (action === "activate") {
      newStatus = scheduled < now ? "overdue" : "active";
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    await pool.query(
      `UPDATE maintenance_tasks
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [newStatus, taskId]
    );
    
    const updated = await pool.query(
        `SELECT 
        t.*, 
        a.name AS asset_name,
        a.model AS asset_model,
        s.schedule_name
        FROM maintenance_tasks t
        LEFT JOIN assets a ON t.asset_id = a.id
        LEFT JOIN maintenance_schedules s ON t.schedule_id = s.id
        WHERE t.id = $1
        `,
        [taskId]
    );

    res.json({ message: "Task updated", task: updated.rows[0] });
  } catch (err) {
    console.error("❌ Skip API error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /tasks/:id/complete
router.post("/:id/complete", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("🟢 Task completion request received");

        const userId = req.user.id;
        const taskId = parseInt(req.params.id);

        // 1️⃣ Fetch the task
        const taskResult = await pool.query(
            `SELECT * FROM maintenance_tasks WHERE id = $1`,
            [taskId]
        );

        if (taskResult.rows.length === 0) {
            return res.status(404).json({ error: "Task not found" });
        }

        const task = taskResult.rows[0];
        if (task.status === "completed") {
            return res.status(400).json({ error: "Task already completed" });
        }

        // 2️⃣ Update task status
        const updatedTaskResult = await pool.query(
           `UPDATE maintenance_tasks
            SET status = 'completed', completed_date = NOW(), updated_at = NOW()
            WHERE id = $1
            RETURNING *`,
            [taskId]
        );

        await pool.query(
            `UPDATE users
             SET completed_tasks = completed_tasks + 1
             WHERE id = $1`,
            [userId]
        );

        // 3️⃣ Join asset and schedule info (same style as your skip route)
        const updated = await pool.query(
           `SELECT 
            t.*, 
            a.name AS asset_name,
            a.model AS asset_model,
            s.schedule_name
            FROM maintenance_tasks t
            LEFT JOIN assets a ON t.asset_id = a.id
            LEFT JOIN maintenance_schedules s ON t.schedule_id = s.id
            WHERE t.id = $1`,
            [taskId]
        );

        res.json({
            message: "✅ Task marked as completed",
            task: updated.rows[0],
        });
    } catch (err) {
        console.error("❌ Complete API error:", err);
        res.status(500).json({ error: "Server error" });
    }
});
// POST /tasks/save
router.post("/save", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("🟢 Task creation request received");

        const {
            asset_id,
            task_name,
            scheduled_date,
            status,
            notes = "",
        } = req.body;

        // 1️⃣ Validate inputs
        if (!asset_id || !task_name || !scheduled_date) {
            return res
                .status(400)
                .json({ error: "Missing required fields: asset_id, task_name, scheduled_date" });
        }

        const user_id = req.user.id;

        // 2️⃣ Insert the new task
        const insertQuery = `
            INSERT INTO maintenance_tasks 
                (asset_id, task_name, scheduled_date, status, notes, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING *;
            `;

        const result = await pool.query(insertQuery, [
            asset_id,
            task_name,
            scheduled_date,
            status,
            notes,
        ]);

        const newTask = result.rows[0];

        await pool.query(
            `UPDATE users
             SET total_tasks = total_tasks + 1
             WHERE id = $1`,
            [user_id]
        );
        console.log(`👤 Incremented total_tasks for user ID: ${user_id}`);

        // 3️⃣ Fetch joined info (to keep the frontend display consistent)
        const detailed = await pool.query(
           `SELECT 
            t.*, 
            a.name AS asset_name,
            a.model AS asset_model,
            s.schedule_name
            FROM maintenance_tasks t
            LEFT JOIN assets a ON t.asset_id = a.id
            LEFT JOIN maintenance_schedules s ON t.schedule_id = s.id
            WHERE t.id = $1`,
            [newTask.id]
         );

        res.status(201).json({
            message: "🟢 New task created successfully",
            task: detailed.rows[0],
        });
    } catch (err) {
        console.error("❌ Task creation API error:", err);
        res.status(500).json({ error: "Server error" });
    }
});


router.get("/:id", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("🟢 Task request received");

        const user_id = req.user.id;

        const taskId = parseInt(req.params.id);
        console.log("🟢 Fetching details for task ID:", taskId);

        // 1️⃣ Fetch the task
        const taskResult = await pool.query(
            `SELECT * FROM maintenance_tasks WHERE id = $1`,
            [taskId]
        );

        if (taskResult.rows.length === 0) {
            return res.status(404).json({ error: "Task not found" });
        }

        // 3️⃣ Join asset and schedule info (same style as your skip route)
        const result = await pool.query(
            `
            SELECT 
                t.*, 
                a.name AS asset_name,
                a.model AS asset_model,
                s.schedule_name
            FROM maintenance_tasks t
            LEFT JOIN assets a ON t.asset_id = a.id
            LEFT JOIN maintenance_schedules s ON t.schedule_id = s.id
            WHERE a.user_id = $1 AND t.id = $2
            ORDER BY t.updated_at DESC
            `,
            [user_id, taskId]
        );

        res.status(200).json({
            message: "✅ Task fetched successfully",
            task: result.rows[0],
        });
    } catch (err) {
        console.error("❌ Complete API error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// PUT /tasks/update/:id
router.put("/update/:id", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("🟢 Task update request received");

        const taskId = parseInt(req.params.id);
        const user_id = req.user.id;
        const { task_name, scheduled_date, status, notes } = req.body;

        // Validate inputs
        if (!task_name || !scheduled_date || !status) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Prevent past dates
        const now = new Date();
        const scheduled = new Date(scheduled_date);
        if (scheduled < new Date(now.setHours(0, 0, 0, 0))) {
            return res.status(400).json({ error: "Scheduled date cannot be in the past" });
        }

        // 1️⃣ Verify the task belongs to the authenticated user
        const verify = await pool.query(
            `
            SELECT t.id 
            FROM maintenance_tasks t
            JOIN assets a ON t.asset_id = a.id
            WHERE t.id = $1 AND a.user_id = $2
            `,
            [taskId, user_id]
        );

        if (verify.rows.length === 0) {
            return res.status(404).json({ error: "Task not found or unauthorized" });
        }

        // 2️⃣ Update the task
        const updatedTaskResult = await pool.query(
            `
            UPDATE maintenance_tasks
            SET 
                task_name = $1,
                scheduled_date = $2,
                status = $3,
                notes = $4,
                updated_at = NOW()
            WHERE id = $5
            RETURNING *
            `,
            [task_name, scheduled_date, status, notes || "", taskId]
        );

        // 3️⃣ Fetch with asset + schedule info (for frontend consistency)
        const updated = await pool.query(
            `
            SELECT 
                t.*, 
                a.name AS asset_name,
                a.model AS asset_model,
                s.schedule_name
            FROM maintenance_tasks t
            LEFT JOIN assets a ON t.asset_id = a.id
            LEFT JOIN maintenance_schedules s ON t.schedule_id = s.id
            WHERE t.id = $1
            `,
                    [taskId]
        );

        res.status(200).json({
            message: "✅ Task updated successfully",
            task: updated.rows[0],
        });

    } catch (err) {
        console.error("❌ Task update API error:", err);
        res.status(500).json({ error: "Server error" });
    }
});


export default router;