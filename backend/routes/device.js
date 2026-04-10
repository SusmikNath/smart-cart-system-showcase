const express = require("express");
const router = express.Router();

const deviceAuth = require("../middleware/deviceAuth");
const ProductService = require("../services/ProductService");
const CartService = require("../services/CartService");
const WeightService = require("../services/WeightService");
const db = require("../firebase");

router.use(deviceAuth);

function normalizeCartId(value) {
  return String(value || "").trim().toUpperCase();
}

function touchDevice(device_id, cart_id) {
  return db.ref(`devices/${device_id}`).update({
    cart_id,
    enabled: true,
    last_seen_at: Date.now(),
  });
}

function ensureDeviceCartMatch(req, cart_id) {
  if (cart_id !== req.device.cart_id) {
    throw {
      code: 403,
      message: `Device ${req.device.device_id} cannot access ${cart_id}`,
    };
  }
}

function ensureCartSession(cart) {
  if (!cart.user_id) {
    throw {
      code: 403,
      message: "No active customer session on this cart",
    };
  }
}

router.post("/scan", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.body.cart_id || req.device.cart_id);
    const rfid = String(req.body.rfid || "").trim().toUpperCase();

    if (!cart_id || !rfid) {
      return res.status(400).json({
        success: false,
        message: "cart_id and rfid are required",
      });
    }

    ensureDeviceCartMatch(req, cart_id);
    await touchDevice(req.device.device_id, cart_id);

    const cart = await CartService.getCart(cart_id);
    ensureCartSession(cart);

    const product = ProductService.getByRfid(rfid);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Unknown RFID: ${rfid}`,
      });
    }

    const result = await CartService.addItem(cart_id, null, {
      rfid: product.rfid,
      barcode: product.barcode,
      name: product.name,
      price: product.price,
      category: product.category,
      weight: product.weight,
      scanned_at: Date.now(),
      scan_type: "RFID_DEVICE",
    });

    const latestCart = await CartService.getCart(cart_id);

    return res.status(200).json({
      success: true,
      message: `${product.name} added to cart`,
      data: {
        product,
        item_count: result.item_count,
        total: result.total,
        expected_weight: result.expected_weight,
        weight_status: latestCart.weight_status || "OK",
        cart_status: latestCart.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/weight", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.body.cart_id || req.device.cart_id);
    const actual_weight = Number(req.body.actual_weight);

    if (!cart_id || Number.isNaN(actual_weight)) {
      return res.status(400).json({
        success: false,
        message: "cart_id and valid actual_weight are required",
      });
    }

    ensureDeviceCartMatch(req, cart_id);
    await touchDevice(req.device.device_id, cart_id);

    const cart = await CartService.getCart(cart_id);
    ensureCartSession(cart);

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
      data: {
        ...weightCheck,
        cart_status: cart.status,
        total: cart.total || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/state/:cart_id", async (req, res, next) => {
  try {
    const cart_id = normalizeCartId(req.params.cart_id);

    ensureDeviceCartMatch(req, cart_id);
    await touchDevice(req.device.device_id, cart_id);

    const cart = await CartService.getCart(cart_id);

    return res.status(200).json({
      success: true,
      data: {
        cart_id,
        status: cart.status || "ACTIVE",
        paid: !!cart.paid,
        user_id: cart.user_id || null,
        item_count: Object.keys(cart.items || {}).length,
        total: cart.total || 0,
        expected_weight: cart.expected_weight || 0,
        actual_weight: cart.actual_weight || 0,
        weight_status: cart.weight_status || "OK",
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;