const express = require("express");
const router = express.Router();
const db = require("../firebase");
const WeightService = require("../services/WeightService");

// POST /scanner/weight
router.post("/weight", async (req, res, next) => {
  try {
    const cart_id = String(req.body.cart_id || "").trim().toUpperCase();
    const actual_weight = Number(req.body.actual_weight);

    if (!cart_id || Number.isNaN(actual_weight)) {
      return res.status(400).json({
        success: false,
        message: "cart_id and valid actual_weight are required",
      });
    }

    const snap = await db.ref(`carts/${cart_id}`).once("value");
    const cart = snap.val();

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const weightCheck = WeightService.check(
      cart.expected_weight || 0,
      actual_weight
    );

    await db.ref(`carts/${cart_id}`).update({
      actual_weight,
      weight_status: weightCheck.status,
      updated_at: Date.now(),
    });

    return res.status(200).json({
      success: true,
      message: "Weight updated",
      data: weightCheck,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;