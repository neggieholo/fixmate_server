import express from "express";
import pool from "./db.js";

const router = express.Router();

// ----------------------
// POST /save - Create a new schedule
router.post("/save", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const user_id = req.user.id;
        const {
            name,
            linked_asset,
            frequency,
            start_date,
            end_date,
            status,
            notes,
        } = req.body;

        // Validate only critical fields
        if (!name || !linked_asset || !frequency) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Use NOW() for start_date if not provided
        const result = await pool.query(
            `INSERT INTO maintenance_schedules
            (schedule_name, asset_id, frequency, start_date, end_date, status, notes, user_id, created_at, updated_at)
            VALUES (
                $1,
                $2,
                $3,
                COALESCE($4::timestamp, NOW()),  -- default to NOW() if null
                $5::timestamp,                   -- can be null
                COALESCE($6, 'active'),          -- default status
                $7,
                $8,
                NOW(),
                NOW()
            )
            RETURNING *`,
            [name, linked_asset, frequency, start_date || null, end_date || null, status, notes, user_id]
        );

        res.status(201).json({
            message: "✅ Schedule created successfully",
            schedule: result.rows[0],
        });
    } catch (err) {
        console.error("❌ Error inserting schedule:", err);
        res.status(500).json({ error: "Server error inserting schedule" });
    }
});


// ----------------------
// GET / - Fetch all schedules for the authenticated user
// ----------------------
router.get("/", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const user_id = req.user.id;

        // Assuming assets table has user_id to filter schedules
        const result = await pool.query(
            `SELECT s.*, a.name AS asset_name
            FROM maintenance_schedules s
            LEFT JOIN assets a ON s.asset_id = a.id
            WHERE s.user_id = $1
            ORDER BY s.updated_at DESC`,
            [user_id]
        );


        res.status(200).json({
            message: "✅ Schedules fetched successfully",
            schedules: result.rows,
        });
    } catch (err) {
        console.error("❌ Error fetching schedules:", err);
        res.status(500).json({ error: "Server error fetching schedules" });
    }
});

// GET /asset/:assetId - Fetch all schedules for a specific asset
// ----------------------
router.get("/asset/:assetId", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const user_id = req.user.id;
        const assetId = parseInt(req.params.assetId, 10);

        if (isNaN(assetId)) {
            return res.status(400).json({ error: "Invalid asset ID" });
        }

        // Ensure the asset belongs to the user
        const assetCheck = await pool.query(
            `SELECT * FROM assets WHERE id = $1 AND user_id = $2`,
            [assetId, user_id]
        );

        if (assetCheck.rows.length === 0) {
            return res.status(404).json({ error: "Asset not found" });
        }

        // Fetch schedules for this asset
        const result = await pool.query(
            `SELECT * FROM maintenance_schedules WHERE linked_asset = $1 ORDER BY start_date DESC`,
            [assetId]
        );

        res.status(200).json({
            message: "✅ Schedules for asset fetched successfully",
            schedules: result.rows,
        });
    } catch (err) {
        console.error("❌ Error fetching schedules for asset:", err);
        res.status(500).json({ error: "Server error fetching schedules for asset" });
    }
});

// ----------------------
// PATCH /:id/status - Pause or activate a schedule
// ----------------------
router.patch("/:id/status", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("Schedules api hit");

        const user_id = req.user.id;
        const scheduleId = parseInt(req.params.id, 10);
        console.log(`Schedule ID: ${scheduleId}`);
        const { status } = req.body; // expected: "active" or "paused"

        if (isNaN(scheduleId)) {
            return res.status(400).json({ error: "Invalid schedule ID" });
        }

        if (!["active", "paused"].includes(status)) {
            return res.status(400).json({ error: "Invalid status value" });
        }

        // Ensure the schedule belongs to this user
        const check = await pool.query(
            `SELECT * FROM maintenance_schedules WHERE id = $1 AND user_id = $2`,
            [scheduleId, user_id]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({ error: "Schedule not found" });
        }

        // Update the schedule status
        const result = await pool.query(
            `UPDATE maintenance_schedules
             SET status = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [status, scheduleId]
        );

        res.status(200).json({
            message: `✅ Schedule ${status === "paused" ? "paused" : "resumed"} successfully`,
            schedule: result.rows[0],
        });
    } catch (err) {
        console.error("❌ Error updating schedule status:", err);
        res.status(500).json({ error: "Server error updating schedule status" });
    }
});

// ----------------------
// PUT /:id - Update an existing schedule
// ----------------------
router.put("/update/:id", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const user_id = req.user.id;
        const scheduleId = parseInt(req.params.id, 10);

        if (isNaN(scheduleId)) {
            return res.status(400).json({ error: "Invalid schedule ID" });
        }

        const {
            schedule_name,
            asset_id,
            frequency,
            start_date,
            end_date,
            status,
            notes,
        } = req.body;

        // Ensure the schedule belongs to this user
        const existing = await pool.query(
            `SELECT * FROM maintenance_schedules WHERE id = $1 AND user_id = $2`,
            [scheduleId, user_id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "Schedule not found" });
        }

        // Update schedule
        const result = await pool.query(
           `UPDATE maintenance_schedules
            SET 
                schedule_name = COALESCE(NULLIF($1, ''), schedule_name),
                end_date = COALESCE(NULLIF($2, '')::timestamp, end_date),
                notes = COALESCE(NULLIF($3, ''), notes),
                frequency = COALESCE(NULLIF($4, ''), frequency),
                updated_at = NOW()
            WHERE id = $5 AND user_id = $6
            RETURNING *`,
            [schedule_name, end_date, notes, frequency, scheduleId, user_id]
        );


        res.status(200).json({
            message: "✅ Schedule updated successfully",
            schedule: result.rows[0],
        });
    } catch (err) {
        console.error("❌ Error updating schedule:", err);
        res.status(500).json({ error: "Server error updating schedule" });
    }
});

router.get("/:id", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const user_id = req.user.id;
        const scheduleId = parseInt(req.params.id, 10);

        if (isNaN(scheduleId)) {
            return res.status(400).json({ error: "Invalid schedule ID" });
        }

        // Ensure the schedule belongs to this user
        const schedule = await pool.query(
            `SELECT s.*, a.name AS asset_name, a.model AS asset_model
            FROM maintenance_schedules s
            LEFT JOIN assets a ON s.asset_id = a.id
            WHERE s.id = $1 AND s.user_id = $2
            ORDER BY s.start_date DESC`,
            [scheduleId, user_id]
        );

        if (schedule.rows.length === 0) {
            return res.status(404).json({ error: "Schedule not found" });
        }

        res.status(200).json({
            message: "✅ Schedule fetched successfully",
            schedule: schedule.rows[0],
        });
    } catch (err) {
        console.error("❌ Error fetching schedule:", err);
        res.status(500).json({ error: "Server error fetching schedule" });
    }
});

// ----------------------
// DELETE /:id - Delete a schedule
// ----------------------
router.delete("/:id", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        console.log('delete api hit')

        const user_id = req.user.id;
        const scheduleId = parseInt(req.params.id, 10);

        if (isNaN(scheduleId)) {
            return res.status(400).json({ error: "Invalid schedule ID" });
        }

        // Ensure the schedule belongs to this user
        const check = await pool.query(
            `SELECT * FROM maintenance_schedules WHERE id = $1 AND user_id = $2`,
            [scheduleId, user_id]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({ error: "Schedule not found" });
        }

        // Delete the schedule
        await pool.query(`DELETE FROM maintenance_schedules WHERE id = $1`, [scheduleId]);

        res.status(200).json({
            message: "✅ Schedule deleted successfully",
            id: scheduleId,
        });
    } catch (err) {
        console.error("❌ Error deleting schedule:", err);
        res.status(500).json({ error: "Server error deleting schedule" });
    }
});

export default router;
