const express = require("express");
const router = express.Router();
const CartService = require("../services/CartService");
const TimerService = require("../services/TimerService");
const ProductService = require("../services/ProductService");
const authMiddleware = require("../middleware/auth");

router.use(authMiddleware);

function normalizeCartId(value) {
  return String(value || "").trim().toUpperCase();
}

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    message,
  });
}

// POST /cart/start-session
router.post("/start-session", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.body.cart_id);
    const mobile = String(req.body.mobile || "").trim();
    const cart_password = String(req.body.cart_password || "").trim();

    if (!cart_id || !mobile || !cart_password) {
      return badRequest(res, "cart_id, mobile and cart_password are required");
    }

    const cart = await CartService.startSession(
      cart_id,
      req.user.user_id,
      mobile,
      cart_password
    );

    return res.status(200).json({
      success: true,
      message: "Session created successfully",
      data: cart,
    });
  } catch (err) {
    // Handle specific cart password validation failure
    if (err.code === 401) {
      return res.status(401).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
});

// GET /cart/:cart_id
router.get("/:cart_id", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.params.cart_id);
    const cart = await CartService.getCart(cart_id, req.user.user_id);

    let timer = null;
    if (cart.status === "LOCKED" || cart.status === "PAYMENT_PENDING") {
      timer = TimerService.formatRemaining(
        TimerService.getRemainingMs(cart.lock_start, cart.lock_duration)
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        ...cart,
        timer,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * NEW ROUTE: Track inactivity for empty carts
 * GET /cart/:cart_id/empty-status
 */
router.get("/:cart_id/empty-status", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.params.cart_id);

    const result = await CartService.getEmptyCartStatus(
      cart_id,
      req.user.user_id
    );

    // If the service determines the 20-minute limit is hit
    if (result.should_release) {
      await CartService.forceReleaseEmptyCart(cart_id, req.user.user_id);

      return res.status(200).json({
        success: true,
        released: true,
        message: "Cart released due to inactivity.",
        data: result,
      });
    }

    return res.status(200).json({
      success: true,
      released: false,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// GET /cart/get-bill/:cart_id
  router.get("/get-bill/:cart_id", async (req, res, next) => {
    try {
      const cart_id = normalizeCartId(req.params.cart_id);
      const cart = await CartService.getCart(cart_id, req.user.user_id);
      const items = cart.items || {};

      return res.status(200).json({
        success: true,
        data: {
          cart_id,
          items,
          item_count: Object.keys(items).length,
          total: cart.total || 0,
          status: cart.status,
          paid: cart.paid || false,
          exit_token: cart.exit_token || null,
          invoice_id: cart.invoice_id || null,
          locked: cart.status === "LOCKED" || cart.status === "PAYMENT_PENDING",
          expected_weight: cart.expected_weight || 0,
          actual_weight: cart.actual_weight || 0,
          weight_status: cart.weight_status || "OK",
          payment_issue: !!cart.payment_issue,
        },
      });
    } catch (err) {
      next(err);
    }
  });
  
// POST /cart/scan-item
router.post("/scan-item", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.body.cart_id);
    const rfid = String(req.body.rfid || "").trim().toUpperCase();

    if (!cart_id || !rfid) {
      return badRequest(res, "cart_id and rfid are required");
    }

    const product = ProductService.getByRfid(rfid);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Unknown RFID",
      });
    }

    const result = await CartService.addItem(cart_id, req.user.user_id, {
      rfid: product.rfid,
      barcode: product.barcode,
      name: product.name,
      price: product.price,
      category: product.category,
      weight: product.weight,
      scanned_at: Date.now(),
      scan_type: "RFID",
    });

    return res.status(200).json({
      success: true,
      message: "Item scanned successfully",
      data: result,
    });
  } catch (err) {
    return res.status(err.code || 500).json({
      success: false,
      message: err.message,
      locked: !!(err.message && err.message.includes("Cannot scan")),
    });
  }
});

router.delete("/:cart_id/item/:item_key", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.params.cart_id);
    const item_key = String(req.params.item_key || "").trim();

    if (!cart_id || !item_key) {
      return badRequest(res, "cart_id and item_key are required");
    }

    const result = await CartService.removeItem(
      cart_id,
      req.user.user_id,
      item_key
    );

    return res.status(200).json({
      success: true,
      message: "Item removed successfully",
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /cart/scan-barcode
router.post("/scan-barcode", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.body.cart_id);
    const barcode = String(req.body.barcode || "").trim();

    if (!cart_id || !barcode) {
      return badRequest(res, "cart_id and barcode are required");
    }

    const product = ProductService.getByBarcode(barcode);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Unknown barcode",
      });
    }

    const result = await CartService.addItem(cart_id, req.user.user_id, {
      rfid: product.rfid,
      barcode: product.barcode,
      name: product.name,
      price: product.price,
      category: product.category,
      weight: product.weight,
      scanned_at: Date.now(),
      scan_type: "BARCODE",
    });

    return res.status(200).json({
      success: true,
      message: "Item scanned successfully by barcode",
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /cart/:cart_id/lock
router.post("/:cart_id/lock", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.params.cart_id);
    const cart = await CartService.lockCart(cart_id, req.user.user_id);

    return res.status(200).json({
      success: true,
      message: "Cart locked. Proceed to payment.",
      data: cart,
    });
  } catch (err) {
    next(err);
  }
});

// POST /cart/:cart_id/cancel-checkout
router.post("/:cart_id/cancel-checkout", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.params.cart_id);
    const cart = await CartService.cancelCheckout(cart_id, req.user.user_id);

    return res.status(200).json({
      success: true,
      message: "Checkout cancelled. Cart restored to ACTIVE.",
      data: cart,
    });
  } catch (err) {
    next(err);
  }
});

// GET /cart/:cart_id/timer
router.get("/:cart_id/timer", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.params.cart_id);

    const { remaining, expired } = await CartService.getRemainingTime(
      cart_id,
      req.user.user_id
    );

    if (expired) {
      await CartService.handleExpiry(cart_id, req.user.user_id);

      return res.status(200).json({
        success: true,
        expired: true,
        ms: 0,
        seconds: 0,
        display: "00:00",
        critical: true,
        message: "Timer expired. Cart restored to ACTIVE.",
      });
    }

    const formatted = TimerService.formatRemaining(remaining);

    return res.status(200).json({
      success: true,
      expired: false,
      ...formatted,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;