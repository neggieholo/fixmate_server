import express from "express";
import multer from "multer";
import pool from "./db.js";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import bcrypt from "bcrypt";

// --- Cloudinary config ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARYAPISECRET, // fixed typo
});

// --- Multer config ---
const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "maintenance_users",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
});

const router = express.Router();

// --- Update Profile ---
router.post("/profile", upload.single("photo"), async (req, res) => {
    try {
        if (!req.user) {            
            return res.status(401).json({ error: "Unauthorized" });
        }
        
        const user_id = req.user.id;
        const { name, oldpassword, newpassword } = req.body;
        const photo_url = req.file ? req.file.path : null;

        

        // Fetch user first
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [user_id]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: "User not found" });

        let password_hash = user.password_hash;

        // --- Handle password change ---
        if (oldpassword && newpassword) {
            const match = await bcrypt.compare(oldpassword, password_hash);
            if (!match) {
                return res.status(400).json({ error: "Incorrect old password" });
            }

            const hashedNew = await bcrypt.hash(newpassword, 10);
            password_hash = hashedNew;
        }

        let new_photo_url = user.photo;
        if (photo_url) {
            // 1️⃣ Delete old Cloudinary image if applicable
            if (user.photo && user.photo.includes("res.cloudinary.com")) {
                try {
                    const publicId = user.photo.split("/").slice(-1)[0].split(".")[0]; // extract file name
                    await cloudinary.uploader.destroy(publicId);
                    console.log("🗑️ Deleted old Cloudinary image:", publicId);
                } catch (err) {
                    console.warn("⚠️ Failed to delete old Cloudinary image:", err.message);
                }
            }

            // 2️⃣ Set new photo URL (Cloudinary upload middleware sets req.file.path)
            new_photo_url = photo_url;
        }

        // --- Build dynamic update fields ---
        const fields = [];
        const values = [];
        let idx = 1;

        if (name) {
            fields.push(`name = $${idx++}`);
            values.push(name);
        }
        if (photo_url) {
            fields.push(`photo = $${idx++}`);
            values.push(new_photo_url);
        }
        if (password_hash !== user.password_hash) {
            fields.push(`password_hash = $${idx++}`);
            values.push(password_hash);
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: "No updates provided" });
        }

        values.push(user_id);
        const query =
            `
            UPDATE users
            SET ${fields.join(", ")}
            WHERE id = $${idx}
            RETURNING id, name, email, photo, timezone, preferences
            `;

        const update = await pool.query(query, values);

        res.status(200).json({
            message: "✅ Profile updated successfully",
            user: update.rows[0],
        });
    } catch (err) {
        console.error("❌ Error updating profile:", err);
        res.status(500).json({ error: "Server error updating profile" });
    }
});

router.post("/preferences", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const user_id = req.user.id;
        const {
            task_generation_notifications,
            notify_prompt,
            prompt_period,
            overdue_task_notifications,
            theme,
        } = req.body;

        console.log("User preferences update request:", req.body);

        const preferences = {
            task_generation_notifications: !!task_generation_notifications,
            prompt_period: prompt_period || null,
            notify_prompt: !!notify_prompt,
            overdue_task_notifications: !!overdue_task_notifications,
            theme: theme || "system",
        };

        const result = await pool.query(
            `
            UPDATE users
            SET preferences = $1
            WHERE id = $2
            RETURNING id, name, email, photo, timezone, preferences
        `,
            [preferences, user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({
            message: "✅ Preferences updated successfully",
            user: result.rows[0],
        });
    } catch (err) {
        console.error("❌ Error updating preferences:", err);
        res.status(500).json({ error: "Server error in updating preferences" });
    }
});

// Update user appearance (theme)
router.post("/appearance", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user_id = req.user.id;
      const { theme } = req.body;
      console.log("User theme update request:", req.body);

    if (!theme) {
      return res.status(400).json({ error: "Theme is required" });
    }

    // Fetch current preferences
    const result = await pool.query(
      `SELECT preferences FROM users WHERE id = $1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentPreferences = result.rows[0].preferences || {};

    // Merge theme into preferences
    const updatedPreferences = {
      ...currentPreferences,
      theme,
    };

    // Save new preferences
    const update = await pool.query(
      `
      UPDATE users
      SET preferences = $1
      WHERE id = $2
      RETURNING id, name, email, preferences, timezone, photo
      `,
      [updatedPreferences, user_id]
    );

    res.status(200).json({
      message: "✅ Theme updated successfully",
      user: update.rows[0],
    });
  } catch (err) {
    console.error("❌ Error updating theme:", err);
    res.status(500).json({ error: "Server error while updating theme" });
  }
});

router.post("/timezone", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const user_id = req.user.id;
        const { timezone } = req.body;
        console.log("User timezone update request:", req.body);

        if (!timezone) {
            return res.status(400).json({ error: "Timezone is required" });
        }

        const update = await pool.query(
            `
            UPDATE users
            SET timezone = $1
            WHERE id = $2
            RETURNING id, name, email, timezone, preferences, photo
            `,
            [timezone, user_id]
        );

        if (update.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({
            message: "✅ Timezone updated successfully",
            user: update.rows[0],
        });
    } catch (err) {
        console.error("❌ Error updating timezone:", err);
        res.status(500).json({ error: "Server error while updating timezone" });
    }
});


export default router;
