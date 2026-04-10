const express = require("express");
const router = express.Router();
const db = require("../firebase");

// GET /api/verify-exit/:token
router.get("/verify-exit/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        status: "DENY",
        message: "No token provided",
      });
    }

    const snap = await db.ref(`exit_passes/${token}`).once("value");
    const pass = snap.val();

    if (!pass) {
      return res.status(404).json({
        success: false,
        status: "DENY",
        message: "Invalid exit token",
      });
    }

    if (pass.used === true) {
      return res.status(200).json({
        success: false,
        status: "DENY",
        message: "Exit token has already been used",
        data: {
          used: true,
          used_at: pass.used_at || null,
        },
      });
    }

    return res.status(200).json({
      success: true,
      status: "ALLOW",
      message: "Exit token verified",
      data: {
        cart_id: pass.cart_id,
        mobile: pass.mobile,
        total_paid: pass.total_paid,
        invoice_id: pass.invoice_id || null,
        used: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/consume-exit/:token
router.post("/consume-exit/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        status: "DENY",
        message: "No token provided",
      });
    }

    const ref = db.ref(`exit_passes/${token}`);
    const snap = await ref.once("value");
    const pass = snap.val();

    if (!pass) {
      return res.status(404).json({
        success: false,
        status: "DENY",
        message: "Invalid exit token",
      });
    }

    if (pass.used === true) {
      return res.status(409).json({
        success: false,
        status: "DENY",
        message: "Exit token has already been used",
      });
    }

    await ref.update({
      used: true,
      used_at: Date.now(),
    });

    // 🔥 Release the cart completely
    await db.ref(`carts/${pass.cart_id}`).update({
      status: "ACTIVE",
      items: {},
      total: 0,
      expected_weight: 0,
      actual_weight: 0,
      weight_status: "OK",
      paid: false,
      txnid: null,
      items_backup: null,
      lock_start: null,
      lock_duration: null,
      payment_issue: false,
      paid_amount: null,
      exit_token: null,
      exit_used: true,
      invoice_id: null,
      user_id: null,   // VERY IMPORTANT
      mobile: null,
      updated_at: Date.now(),
    });

    // 🔥 Clear user's active cart
    await db.ref(`users/${pass.user_id}`).update({
      active_cart: null,
      updated_at: Date.now(),
    });

    // await db.ref(`carts/${pass.cart_id}`).update({
    //   exit_used: true,
    //   updated_at: Date.now(),
    // });

    return res.status(200).json({
      success: true,
      status: "ALLOW",
      message: "Exit token consumed successfully",
      data: {
        cart_id: pass.cart_id,
        mobile: pass.mobile,
        total_paid: pass.total_paid,
        invoice_id: pass.invoice_id || null,
        used: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;