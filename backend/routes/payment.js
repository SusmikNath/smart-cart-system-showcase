const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const PaymentService = require("../services/PaymentService");
const CartService = require("../services/CartService");
const authMiddleware = require("../middleware/auth");
const path = require("path");
const fs = require("fs");
const db = require("../firebase");

router.use(express.json());

// POST /payment/create-order
router.post("/create-order", authMiddleware, async (req, res, next) => {
  try {
    const cart_id = String(req.body.cart_id || "").trim().toUpperCase();

    if (!cart_id) {
      return res.status(400).json({
        success: false,
        message: "cart_id is required",
      });
    }

    const { txnid, amount, hash, payment_id } =
      await PaymentService.createOrder(cart_id, req.user.user_id);

    const upiLink = `upi://pay?pa=smartcart@payu&pn=SmartCart&am=${amount}&cu=INR&tn=${cart_id}`;
    const qr_base64 = await QRCode.toDataURL(upiLink);

    return res.status(200).json({
      success: true,
      message: "Payment order created successfully",
      data: {
        cart_id,
        txnid,
        amount,
        hash,
        payment_id,
        upiLink,
        qr_base64,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /payment/webhook
router.post("/webhook", async (req, res, next) => {
  try {
    const result = await PaymentService.processWebhook(req.body);

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /payment/simulate-success
router.post("/simulate-success", authMiddleware, async (req, res, next) => {
  try {
    const cart_id = String(req.body.cart_id || "").trim().toUpperCase();

    if (!cart_id) {
      return res.status(400).json({
        success: false,
        message: "cart_id is required",
      });
    }

    const result = await PaymentService.simulateSuccess(
      cart_id,
      req.user.user_id
    );

    return res.status(200).json({
      success: true,
      message: "Demo payment completed successfully",
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// GET /payment/invoice/:invoice_id
router.get("/invoice/:invoice_id", authMiddleware, async (req, res, next) => {
  try {
    const invoice_id = String(req.params.invoice_id || "").trim();

    if (!invoice_id) {
      return res.status(400).json({
        success: false,
        message: "invoice_id is required",
      });
    }

    const snap = await db.ref(`invoices/${invoice_id}`).once("value");
    const invoice = snap.val();

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    if (invoice.user_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const filepath = path.resolve(__dirname, "..", invoice.pdf_path || "");

    if (!filepath.startsWith(path.resolve(__dirname, ".."))) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice path",
      });
    }

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        message: "PDF file not found",
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${invoice_id}.pdf`
    );

    return fs.createReadStream(filepath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// Optional helper for payment page refresh / QR rebuild
router.post("/refresh-order", authMiddleware, async (req, res, next) => {
  try {
    const cart_id = String(req.body.cart_id || "").trim().toUpperCase();

    if (!cart_id) {
      return res.status(400).json({
        success: false,
        message: "cart_id is required",
      });
    }

    const cart = await CartService.getCart(cart_id, req.user.user_id);

    if (cart.status !== "LOCKED" && cart.status !== "PAYMENT_PENDING") {
      return res.status(400).json({
        success: false,
        message: `Cart is not in payment flow. Current: ${cart.status}`,
      });
    }

    if (cart.status === "LOCKED") {
      const result = await PaymentService.createOrder(cart_id, req.user.user_id);
      const upiLink = `upi://pay?pa=smartcart@payu&pn=SmartCart&am=${result.amount}&cu=INR&tn=${cart_id}`;
      const qr_base64 = await QRCode.toDataURL(upiLink);

      return res.status(200).json({
        success: true,
        message: "Payment order refreshed successfully",
        data: {
          ...result,
          cart_id,
          upiLink,
          qr_base64,
        },
      });
    }

    const amount = parseFloat(cart.total || 0).toFixed(2);
    const txnid = cart.txnid;
    const upiLink = `upi://pay?pa=smartcart@payu&pn=SmartCart&am=${amount}&cu=INR&tn=${cart_id}`;
    const qr_base64 = await QRCode.toDataURL(upiLink);

    return res.status(200).json({
      success: true,
      message: "Existing payment order returned",
      data: {
        cart_id,
        txnid,
        amount,
        upiLink,
        qr_base64,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;