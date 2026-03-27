import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import { authStorage } from "./storage";
import type { User as AuthUser } from "@shared/models/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const user = await authStorage.getUserByEmail(email);
      if (!user) return done(null, false, { message: "Invalid email or password." });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return done(null, false, { message: "Invalid email or password." });
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await authStorage.getUser(id);
    done(null, user ?? false);
  } catch (err) {
    done(err);
  }
});
