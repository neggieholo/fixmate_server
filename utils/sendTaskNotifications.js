import nodemailer from "nodemailer";
import pool from "../db.js";


const transporter = nodemailer.createTransport({
  host: "smtp.zeptomail.com",
  port: 587,
  auth: {
    user: "emailapikey",
    pass: process.env.ZOHOEMAILPASS,
  },
});

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}


async function sendTaskNotifications() {
    console.log("📬 Running task notification check...");

    const now = new Date();
    const twoWeeksFromNow = new Date();
    twoWeeksFromNow.setDate(now.getDate() + 14);

    // 1️⃣ Fetch tasks that are upcoming (within 2 weeks) but not overdue
   try {
    // ✅ Use schedule_id → schedules.user_id → users.email
    const upcoming = await pool.query(
      `SELECT mt.*, u.email AS user_email
       FROM maintenance_tasks mt
       LEFT JOIN maintenance_schedules s ON mt.schedule_id = s.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE mt.status IN ('active', 'overdue')
       AND mt.scheduled_date BETWEEN NOW() AND $1`,
      [twoWeeksFromNow]
    );

    if (upcoming.rows.length > 0) {
      const recipientEmails = upcoming.rows
        .map(t => t.user_email)
        .filter(Boolean);

      if (recipientEmails.length > 0) {
        const chunks = chunkArray(recipientEmails, 50);

        for (const chunk of chunks) {
          const mailOptions = {
            from: "FixMate <no-reply@fixmate.snametechapp.com>",
            to: "no-reply@fixmate.snametechapp.com",
            bcc: chunk,
            subject: "🔔 Upcoming Maintenance Task Reminder",
            html: `
              <p>Hi there,</p>
              <p>The following maintenance tasks are due within the next 2 weeks:</p>
              <ul>
                ${upcoming.rows
                  .map(
                    t => `
                    <li>
                      <strong>${t.task_name}</strong> — scheduled for 
                      <em>${new Date(t.scheduled_date).toLocaleDateString()}</em>
                    </li>`
                  )
                  .join("")}
              </ul>
              <p>Please review and take the necessary actions.</p>
              <p>– EnergyProjectsData</p>
            `,
          };

          await transporter.sendMail(mailOptions);
          console.log(`📧 Sent reminder batch to ${chunk.length} users`);
        }
      } else {
        console.log("⚠️ No user emails found for upcoming tasks.");
      }
    } else {
      console.log("✅ No upcoming tasks within 2 weeks.");
    }

    // 2️⃣ Mark overdue tasks
    const overdue = await pool.query(
       `UPDATE maintenance_tasks
        SET status = 'overdue', updated_at = NOW()
        WHERE scheduled_date < NOW() AND status = 'active'
        RETURNING id, task_name`
    );


    overdue.rows.forEach(t =>
        console.log(`⏰ Marked overdue: ${t.task_name}`)
    );

    // 3️⃣ Delete completed tasks (cleanup)
    const deleted = await pool.query(
        `DELETE FROM maintenance_tasks WHERE status = 'completed' RETURNING id, task_name`
    );
    if (deleted.rows.length > 0)
           console.log(`🧹 Deleted ${deleted.rows.length} completed task(s).`);
       
   } catch (err) {
       console.error("❌ Error in sendTaskNotifications:", err);
   }
}

export default sendTaskNotifications;
