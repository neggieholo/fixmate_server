import pool from "../db.js";
import calculateTaskDates from "./ScheduleHelper.js";

export default async function generateTasksFromSchedules() {
    console.log("🕒 Running cron job: generating maintenance tasks...");

    try {
        const now = new Date();

        // 1️⃣ Delete expired schedules
        const deleted = await pool.query(
           `DELETE FROM maintenance_schedules
            WHERE end_date IS NOT NULL AND end_date < NOW()
            RETURNING id, schedule_name`
        );

        if (deleted.rows.length > 0) {
            console.log(`🗑️ Deleted ${deleted.rows.length} expired schedule(s):`);
            deleted.rows.forEach(s => console.log(`   - ${s.schedule_name}`));
        }

        // 2️⃣ Fetch active schedules only (skip paused)
        const schedules = await pool.query(`
            SELECT *
            FROM maintenance_schedules
            WHERE status IS NULL OR status != 'paused'
         `);

        if (schedules.rows.length === 0) {
            console.log("😴 No active schedules found.");
            return;
        }

        // 3️⃣ Iterate through schedules
        for (const schedule of schedules.rows) {
            const { id, asset_id, schedule_name, start_date, end_date, frequency, notes, user_id, standard_value } = schedule;

            // Skip invalid or expired schedules
            if (!start_date || (end_date && new Date(end_date) < now)) {
                console.log(`⏭️ Skipping invalid/expired: ${schedule_name}`);
                continue;
            }

            // 4️⃣ Check if there’s any overdue task for this schedule
            const overdue = await pool.query(
               `SELECT id FROM maintenance_tasks
                WHERE schedule_id = $1 
                AND status IN ('pending','active')
                AND scheduled_date < NOW()`,
                        [id]
            );
            if (overdue.rows.length > 0) {
                console.log(`⚠️ Skipping ${schedule_name}: has overdue task(s)`);
                continue;
            }

            // 5️⃣ Calculate next task date
            const { next_task_date } = calculateTaskDates(new Date(start_date), frequency);

            // Avoid duplicates for same schedule/date
            const existing = await pool.query(
                `SELECT id FROM maintenance_tasks 
                 WHERE schedule_id = $1 AND scheduled_date::date = $2::date`,
                [id, next_task_date]
            );

            if (existing.rows.length > 0) {
                console.log(`⚠️ Task already exists for ${schedule_name} on ${next_task_date.toDateString()}`);
                continue;
            }

            await pool.query(
               `DELETE FROM maintenance_tasks 
                WHERE schedule_id = $1 AND status = 'skipped'`,
                [id]
            );

            // 6️⃣ Create new active task
            const taskResult = await pool.query(
               `INSERT INTO maintenance_tasks 
                (asset_id, schedule_id, task_name, scheduled_date,standard_value, status, notes, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW(), NOW())
                RETURNING *`,
                [asset_id, id, `${schedule_name}`, next_task_date, standard_value ?? null, notes || ""]
                );

                const task = taskResult.rows[0];
                console.log(`✅ Created new task: ${task.task_name} (Scheduled: ${next_task_date.toDateString()})`);
                
            await pool.query(
               `UPDATE users
                SET total_tasks = total_tasks + 1
                WHERE id = $1`,
                [user_id]
            );
            console.log(`👤 Incremented total_tasks for user ID: ${user_id}`);

        }

        console.log("✅ Cron job finished successfully.");
    } catch (err) {
        console.error("❌ Cron job error:", err);
    }
}

