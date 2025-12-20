import express from "express";
import session from "express-session";
import passport from "passport";
import connectPgSimple from "connect-pg-simple";
import pool from "./db.js";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import cors from "cors";
import assetsRoute from "./assets.js";
import schedulesRoute from "./schedules.js";
import tasksRoute from "./tasks.js";
import settingsRoute from "./settings.js";
import categoriesRoute from "./categories.js";
import assetsCategoriesRoute from './admin/asset_categories.js'
import assetsSubCategoriesRoute from './admin/subcategories.js'
import assetsTypesRoute from './admin/asset_types.js'
import taskCategoriesRoute from './admin/task_categories.js'
import generateTasksFromSchedules from "./utils/generateTasks.js";
import sendTaskNotifications from "./utils/sendTaskNotifications.js";
import cron from "node-cron";

// import ngrok from '@ngrok/ngrok';

dotenv.config();

import setupLocal from "./auth/local.js";
import setupGoogle from "./Auth/google.js";
import setupAdminLocal from "./auth/adminPassport.js";



const app = express();
const PgSession = connectPgSimple(session);

app.use(express.json());
app.use(cors({
    origin: ["http://localhost:3000", "https://fixmate.snametechapp.com"],
    credentials: true               // allow cookies to be sent
}));
app.use(
    session({
        store: new PgSession({
            pool,
            pruneSessionInterval: 60
        }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);
app.use(passport.initialize());
app.use(passport.session());
app.use("/api/assets", assetsRoute);
app.use("/api/schedules", schedulesRoute);
app.use("/api/tasks", tasksRoute);
app.use("/api/settings", settingsRoute);
app.use("/api/categories", categoriesRoute);
app.use("/api/asset_categories", assetsCategoriesRoute);
app.use("/api/asset_subcategories", assetsSubCategoriesRoute);
app.use("/api/asset_types", assetsTypesRoute);
app.use("/api/task_categories", taskCategoriesRoute);

setupLocal(passport);
setupGoogle(passport);
setupAdminLocal(passport);

app.get("/debug-session", (req, res) => {
  console.log("req.sessionID:", req.sessionID);
  console.log("req.session:", req.session);
  res.json({ sessionID: req.sessionID, session: req.session });
});

// Register (email)
app.post("/api/register", async (req, res, next) => {
    const { email, password, name } = req.body;

    if (email.endsWith("@gmail.com")) {
        return res.status(400).json({ error: "Please use Google Login for Gmail accounts." });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
            [email, hash, name]
        );

        const user = result.rows[0];

        // ✅ Automatically create a session
        req.login(user, (err) => {
            if (err) return next(err);
            res.json({ success: true, user });
        });

    } catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message });
    }
});



// Login (email)
app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            // user not found or password incorrect
            return res.status(401).json({ error: info?.message || "Invalid credentials" });
        }

        // log the user in (establish session)
        req.logIn(user, (err) => {
            if (err) return next(err);
            return res.json({ success: true, user }); // success
        });
    })(req, res, next);
});

app.post("/api/admin_login", (req, res, next) => {
    passport.authenticate("admin-local", (err, user, info) => {
        if (err) return next(err);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: info?.message || "Admin login failed",
            });
        }

        req.logIn(user, (err) => {
            if (err) return next(err);

            return res.json({
                success: true,
                admin: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                },
            });
        });
    })(req, res, next);
});

// Google login
app.get(
  "/api/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account"
  })
);

app.get(
    "/api/auth/google/callback",
    passport.authenticate("google", { failureRedirect: process.env.FRONTEND_URL }),
    (req, res) => {
        // user info stored in session
        res.redirect(process.env.FRONTEND_URL + "/home/dashboard");
    }
);


app.get("/api/auth/user", (req, res) => {
    // console.log('auth check');
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    // console.log(req.user);
    res.json({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        photo: req.user.photo,
        total_tasks: req.user.total_tasks,
        completed_tasks: req.user.completed_tasks,
        provider: req.user.provider,
        preferences: req.user.preferences,
        timezone: req.user.timezone,
    });
});


// Logout
app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);

        // Destroy session on server
        req.session.destroy((err) => {
            if (err) return next(err);
            console.log("Session destroyed");

            // Clear cookie on client
            res.clearCookie("connect.sid"); // default cookie name for express-session
            res.json({ message: "Logged out" });
        });
    });
});

// cron.schedule(
//     "0 0 * * *", // every day at 00:00
//     async () => {
//         console.log("🌙 Midnight cron started (Africa/Lagos timezone)...");

//         try {
//             // 1️⃣ Generate new tasks first
//             await generateTasksFromSchedules();

//             // 2️⃣ Then send notifications & clean tasks
//             await sendTaskNotifications();

//             console.log("✅ All nightly jobs completed successfully.");
//         } catch (err) {
//             console.error("❌ Error during nightly cron jobs:", err);
//         }
//     },
//     {
//         timezone: "Africa/Lagos", // ensures correct local time for your region
//     }
// );


cron.schedule(
    "0 0 * * *", 
    async () => {
        console.log("🚀 Running one-time cron job (00:00 Africa/Lagos)...");

        try {
            await generateTasksFromSchedules();
            await sendTaskNotifications();
            console.log("✅ Cron job completed successfully.");
        } catch (err) {
            console.error("❌ Error during cron job:", err);
        }
    },
    {
        timezone: "Africa/Lagos",
    }
);

app.listen(4000, () => console.log("Server running on http://localhost:4000"));

// app.listen(PORT, async () => {
//     console.log(`Server running on http://localhost:${PORT}`);

//     // Start ngrok for your Express app
//     const listener = await ngrok.connect({ addr: PORT, authtoken: process.env.NGROK_AUTH_TOKEN });
//     console.log(`Public ngrok URL: ${listener.url()}`);
// });