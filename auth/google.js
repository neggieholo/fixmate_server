import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import pool from "../db.js";
import dotenv from "dotenv";
dotenv.config();

export default function setupGoogle(passport) {
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: process.env.GOOGLE_CALLBACK_URL,
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    // Check if user exists
                    const res = await pool.query(
                        "SELECT * FROM users WHERE google_id = $1",
                        [String(profile.id)]
                    );

                    let user;
                    if (res.rows.length === 0) {
                        // Create a new user
                        const insert = await pool.query(
                            `INSERT INTO users (google_id, name, email, photo, provider)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *`,
                            [
                                profile.id,
                                profile.displayName,
                                profile.emails?.[0]?.value || null,
                                profile.photos?.[0]?.value || null,
                                'google'
                            ]
                        );
                        user = insert.rows[0];
                    } else {
                        user = res.rows[0];
                    }

                    done(null, user); // user.id will be serialized next
                } catch (err) {
                    done(err);
                }
            }
        )
    );
}

