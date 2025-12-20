import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";

/**
 * Admin login using ENV credentials only
 */
export default function setupAdminLocal(passport) {
    passport.use(
        "admin-local",
        new LocalStrategy(
            { usernameField: "email" },
            async (email, password, done) => {
                try {
                    const adminEmail = process.env.ADMIN_EMAIL;
                    const adminPassword = process.env.ADMIN_PASSWORD;

                    if (!adminEmail || !adminPassword) {
                        return done(null, false, { message: "Admin login not configured" });
                    }

                    if (email !== adminEmail) {
                        return done(null, false, { message: "Invalid admin credentials" });
                    }

                    /**
                     * OPTION A — Plain text env password (simple)
                     */
                    if (password !== adminPassword) {
                        return done(null, false, { message: "Invalid admin credentials" });
                    }

                    /**
                     * OPTION B — Hashed env password (recommended)
                     *
                     * const valid = await bcrypt.compare(password, adminPassword);
                     * if (!valid) return done(null, false, { message: "Invalid admin credentials" });
                     */

                    // Fake admin user object (no DB)
                    const adminUser = {
                        id: "admin",
                        email: adminEmail,
                        role: "admin",
                    };

                    return done(null, adminUser);
                } catch (err) {
                    return done(err);
                }
            }
        )
    );
}
