import express from "express";
import multer from "multer";
import pool from "./db.js";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

const router = express.Router();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARYAPISECRET,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "maintenance_assets", // better descriptive folder
        allowed_formats: ["jpg", "jpeg", "png", "webp"]
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// GET / - Fetch all assets
// GET /assets
router.get("/", async (req, res) => {
    try {
        // Make sure the user is authenticated
        if (!req.user) {
            console.log("unauthorized for assets");
            return res.status(401).json({ error: "Unauthorized" });
        }
       
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT * FROM assets WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );

        res.status(200).json({
            message: "✅ Assets fetched successfully",
            assets: result.rows,
        });
    } catch (err) {
        console.error("❌ Error fetching assets:", err);
        res.status(500).json({ error: "Server error fetching assets" });
    }
});

// GET /assets/:id
router.get("/:id", async (req, res) => {
  try {
    // Ensure the user is authenticated
    if (!req.user) {
      console.log("unauthorized for fetching asset by ID");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.id;
    const assetId = parseInt(req.params.id, 10);

    if (isNaN(assetId)) {
      return res.status(400).json({ error: "Invalid asset ID" });
    }

    // Fetch asset and join with asset_types and subcategories to get subcategory name
    const result = await pool.query(
      `SELECT 
          a.*,
          sc.name AS subcategory
       FROM assets a
       LEFT JOIN asset_types at ON a.asset_type_id = at.id
       LEFT JOIN asset_subcategories sc ON at.subcategory_id = sc.id
       WHERE a.id = $1 AND a.user_id = $2`,
      [assetId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Asset not found" });
    }

    res.status(200).json({
      message: "✅ Asset fetched successfully",
      asset: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Error fetching asset by ID:", err);
    res.status(500).json({ error: "Server error fetching asset" });
  }
});


// PUT /assets/update/:id
router.put("/update/:id", upload.single("photo"), async (req, res) => {
    try {
        if (!req.user) {
            console.log("unauthorized for updating asset");
            return res.status(401).json({ error: "Unauthorized" });
        }

        const userId = req.user.id;
        const assetId = parseInt(req.params.id, 10);

        if (isNaN(assetId)) {
            return res.status(400).json({ error: "Invalid asset ID" });
        }

        // Fetch existing asset first
        const existing = await pool.query(
            `SELECT * FROM assets WHERE id = $1 AND user_id = $2`,
            [assetId, userId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "Asset not found" });
        }

        const oldAsset = existing.rows[0];
        let newPhotoUrl = oldAsset.photo_url;

        // If new photo uploaded, replace old one
        if (req.file) {
            newPhotoUrl = req.file.path;

            // Extract public ID from old photo and delete it from Cloudinary
            if (oldAsset.photo_url) {
                const segments = oldAsset.photo_url.split("/");
                const filename = segments.pop().split("?")[0]; // safer
                const publicId = "maintenance_assets/" + filename.split(".")[0];

                try {
                    await cloudinary.uploader.destroy(publicId);
                    console.log(`🗑️ Deleted old Cloudinary image: ${publicId}`);
                } catch (err) {
                    console.warn("⚠️ Failed to delete old Cloudinary image:", err);
                }
            }
        } else {
            newPhotoUrl = oldAsset.photo_url;
        }

        const {
            name,
            category,
            manufacturer,
            model,
            serial_number,
            location,
            purchase_date: rawPurchaseDate,
            warranty_expiry: rawWarrantyExpiry,
            status,
            notes,
        } = req.body;

        const purchase_date = rawPurchaseDate?.trim() ? rawPurchaseDate : null;
        const warranty_expiry = rawWarrantyExpiry?.trim() ? rawWarrantyExpiry : null;

        const result = await pool.query(
            `UPDATE assets
             SET name = $1,
                 category = $2,
                 manufacturer = $3,
                 model = $4,
                 serial_number = $5,
                 location = $6,
                 purchase_date = $7,
                 warranty_expiry = $8,
                 status = $9,
                 notes = $10,
                 photo_url = $11,
                 updated_at = NOW()
             WHERE id = $12 AND user_id = $13
             RETURNING *`,
            [
                name || oldAsset.name,
                category || oldAsset.category,
                manufacturer || oldAsset.manufacturer,
                model || oldAsset.model,
                serial_number || oldAsset.serial_number,
                location || oldAsset.location,
                purchase_date || oldAsset.purchase_date,
                warranty_expiry || oldAsset.warranty_expiry,
                status || oldAsset.status,
                notes || oldAsset.notes,
                newPhotoUrl,
                assetId,
                userId,
            ]
        );

        res.status(200).json({
            message: "✅ Asset updated successfully",
            asset: result.rows[0],
        });
    } catch (err) {
        console.error("❌ Error updating asset:", err);
        res.status(500).json({ error: "Server error updating asset" });
    }
});



// POST /save - handle form data + photo upload
router.post("/save", upload.single("photo"), async (req, res) => {
    if (!req.user) {
        console.log("unauthorized for updating asset");
        return res.status(401).json({ error: "Unauthorized" });
    }

    console.log("Uploaded Cloudinary file:", req.file);
    console.log("Form data:", req.body);

    try {
        const {
            category_name,
            asset_type_name,
            asset_type_id,
            subcategory_id,
            manufacturer,
            model,
            serial_number,
            location,
            purchase_date: rawPurchaseDate,
            warranty_expiry: rawWarrantyExpiry,
            status,
            notes
        } = req.body;

        const purchase_date = rawPurchaseDate?.trim() ? rawPurchaseDate : null;
        const warranty_expiry = rawWarrantyExpiry?.trim() ? rawWarrantyExpiry : null;

        const user_id = req.user.id;
        const photo_url = req.file ? req.file.path : null;

        // Determine final asset name
        let assetName 

        if (asset_type_name && asset_type_name.trim()) {
            assetName = asset_type_name.trim();
        }

        // If asset_type_id exists, fetch name from asset_types table
        if (asset_type_id) {
            const assetTypeResult = await pool.query(
                `SELECT name FROM asset_types WHERE id = $1`,
                [asset_type_id]
            );
            if (assetTypeResult.rows.length > 0) {
                assetName = assetTypeResult.rows[0].name;
            }
        }

        // Insert into assets
        const result = await pool.query(
            `INSERT INTO assets 
            (name, category, asset_type_id, manufacturer, model, serial_number, location, purchase_date, warranty_expiry, status, notes, user_id, photo_url, created_at, updated_at, subcategory_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW(),$14)
            RETURNING *`,
            [
                assetName,
                category_name,
                asset_type_id || null,
                manufacturer,
                model,
                serial_number,
                location,
                purchase_date,
                warranty_expiry,
                status,
                notes,
                user_id,
                photo_url,
                subcategory_id,
            ]
        );

        res.status(201).json({
            message: "✅ Asset created successfully",
            asset: result.rows[0],
        });
    } catch (err) {
        console.error("❌ Error inserting asset:", err);
        res.status(500).json({ error: "Server error inserting asset" });
    }
});


// DELETE /assets/:id - Delete asset and its Cloudinary image
router.delete("/:id", async (req, res) => {
    try {
        if (!req.user) {
            console.log("unauthorized for deleting asset");
            return res.status(401).json({ error: "Unauthorized" });
        }

        const userId = req.user.id;
        const assetId = parseInt(req.params.id, 10);

        if (isNaN(assetId)) {
            return res.status(400).json({ error: "Invalid asset ID" });
        }

        // Fetch the asset to confirm ownership and get image URL
        const result = await pool.query(
            `SELECT * FROM assets WHERE id = $1 AND user_id = $2`,
            [assetId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Asset not found" });
        }

        const asset = result.rows[0];

        // Delete from Cloudinary if photo exists
        if (asset.photo_url) {
            const segments = asset.photo_url.split("/");
            const filename = segments.pop().split("?")[0];
            const publicId = "maintenance_assets/" + filename.split(".")[0];

            try {
                await cloudinary.uploader.destroy(publicId);
                console.log(`🗑️ Deleted Cloudinary image: ${publicId}`);
            } catch (err) {
                console.warn("⚠️ Failed to delete Cloudinary image:", err);
            }
        }

        // Delete asset record from database
        await pool.query(`DELETE FROM assets WHERE id = $1 AND user_id = $2`, [
            assetId,
            userId,
        ]);

        res.status(200).json({
            message: "✅ Asset deleted successfully",
            deletedAssetId: assetId,
        });
    } catch (err) {
        console.error("❌ Error deleting asset:", err);
        res.status(500).json({ error: "Server error deleting asset" });
    }
});


export default router;
