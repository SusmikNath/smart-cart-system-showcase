const jwt = require("jsonwebtoken");
const db = require("../firebase");

class AuthService {
  validateMobile(mobile) {
    return /^[6-9]\d{9}$/.test(String(mobile || "").trim());
  }

  generateUserId(mobile) {
    return `USER_${mobile}`;
  }

  generateToken(user) {
    return jwt.sign(
      {
        user_id: user.user_id,
        mobile: user.mobile,
        name: user.name || "Customer",
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
  }

  async loginWithMobile(mobile, name = "Customer") {
    const cleanMobile = String(mobile || "").trim();

    if (!this.validateMobile(cleanMobile)) {
      throw { code: 400, message: "Enter a valid 10-digit Indian mobile number" };
    }

    const user_id = this.generateUserId(cleanMobile);
    const userRef = db.ref(`users/${user_id}`);
    const snap = await userRef.once("value");

    let user;

    if (snap.exists()) {
      user = snap.val();

      await userRef.update({
        last_login_at: Date.now(),
        updated_at: Date.now(),
      });

      user = {
        ...user,
        last_login_at: Date.now(),
        updated_at: Date.now(),
      };
    } else {
      user = {
        user_id,
        mobile: cleanMobile,
        name: String(name || "Customer").trim(),
        active_cart: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        last_login_at: Date.now(),
      };

      await userRef.set(user);
    }

    const token = this.generateToken(user);

    return {
      token,
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        name: user.name,
        active_cart: user.active_cart || null,
      },
    };
  }
}

module.exports = new AuthService();