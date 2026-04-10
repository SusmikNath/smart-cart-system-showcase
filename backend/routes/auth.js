const express = require("express");
const router = express.Router();
const AuthService = require("../services/AuthService");

// POST /auth/login
// Demo login by mobile number
router.post("/login", async (req, res) => {
  try {
    const { mobile, name } = req.body;

    const result = await AuthService.loginWithMobile(mobile, name);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (err) {
    res.status(err.code || 500).json({
      success: false,
      message: err.message || "Login failed",
    });
  }
});

// GET /auth/demo-users
// Optional helper for tech fest demo
router.get("/demo-users", (req, res) => {
  res.status(200).json({
    success: true,
    data: [
      { mobile: "9876543210", name: "Roni" },
      { mobile: "9123456780", name: "Aarav" },
      { mobile: "9988776655", name: "Diya" },
    ],
  });
});

module.exports = router;