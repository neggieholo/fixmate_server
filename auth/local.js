import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import pool from "../db.js";

export default function setupLocal(passport) {
    passport.use(
        new LocalStrategy(
            { usernameField: "email" },
            async (email, password, done) => {
                try {
                    const res = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
                    const user = res.rows[0];
                    if (!user) return done(null, false, { message: "No user found" });
                    if (!user.password_hash) {
                        return done(null, false, { message: "Use Google Login for this account" });
                    }

                    const valid = await bcrypt.compare(password, user.password_hash);
                    if (!valid) return done(null, false, { message: "Incorrect password" });

                    return done(null, user);
                } catch (err) {
                    return done(err);
                }
            }
        )
    );

    passport.serializeUser((user, done) => {
    if (user.role && user.role === "admin") {
        return done(null, { type: "admin" });
    }

    done(null, { type: "user", id: user.id });
});

    passport.deserializeUser(async (data, done) => {
        try {
            /**
             * Admin user — no DB
             */
            if (data.type === "admin") {
                return done(null, {
                    id: "admin",
                    email: process.env.ADMIN_EMAIL,
                    role: "admin",
                });
            }

            /**
             * Normal user — DB lookup
             */
            const res = await pool.query(
                "SELECT * FROM users WHERE id = $1",
                [data.id]
            );

            done(null, res.rows[0]);
        } catch (err) {
            done(err);
        }
    });
}
