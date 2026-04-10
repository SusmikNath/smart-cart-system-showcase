const crypto = require("crypto");
const db = require("../firebase");
const CartService = require("./CartService");
const TimerService = require("./TimerService");
const InvoiceService = require("./InvoiceService");

class PaymentService {
  generateHash(txnid, amount, productinfo, firstname, email, udf1) {
    const str = `${process.env.PAYU_KEY}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}||||||||||${process.env.PAYU_SALT}`;
    return crypto.createHash("sha512").update(str).digest("hex");
  }

  verifyHash(fields) {
    const { hash, status, txnid, amount, productinfo, firstname, email, udf1 } =
      fields;

    const str = `${process.env.PAYU_SALT}|${status}||||||||||${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${process.env.PAYU_KEY}`;
    const computed = crypto.createHash("sha512").update(str).digest("hex");

    return computed === hash;
  }

  async findPaymentByTxnid(txnid) {
    const snap = await db
      .ref("payments")
      .orderByChild("txnid")
      .equalTo(txnid)
      .once("value");

    let payment = null;

    snap.forEach((child) => {
      payment = {
        payment_id: child.key,
        ...child.val(),
      };
    });

    return payment;
  }

  async createPaymentRecord({ cart_id, user_id, txnid, amount }) {
    const timestamp = Date.now();
    const payment_id = `PAY_${cart_id.replace(/_/g, "")}_${timestamp}`;

    const payload = {
      cart_id,
      user_id,
      txnid,
      amount: parseFloat(amount),
      status: "PENDING",
      created_at: timestamp,
      updated_at: timestamp,
    };

    await db.ref(`payments/${payment_id}`).set(payload);

    return {
      payment_id,
      ...payload,
    };
  }

  verifyPaymentAmount(cart, amount) {
    const paidAmount = parseFloat(amount).toFixed(2);
    const expectedAmount = parseFloat(cart.total).toFixed(2);

    if (paidAmount !== expectedAmount) {
      throw {
        code: 400,
        message: `Amount mismatch. Expected ₹${expectedAmount}, got ₹${paidAmount}`,
      };
    }

    return {
      paidAmount,
      expectedAmount,
    };
  }

  async createOrder(cart_id, user_id) {
    const cart = await CartService.getCart(cart_id, user_id);

    if (cart.status !== "LOCKED") {
      throw {
        code: 400,
        message: `Cart must be LOCKED to create order. Current: ${cart.status}`,
      };
    }

    if (cart.weight_status === "MISMATCH") {
      throw {
        code: 400,
        message: "Weight mismatch detected. Please verify cart items before payment.",
      };
    }

    if (TimerService.isExpired(cart.lock_start, cart.lock_duration)) {
      await CartService.handleExpiry(cart_id, user_id);
      throw {
        code: 410,
        message: "Payment window expired. Cart restored. Please try again.",
      };
    }

    const timestamp = Date.now();
    const cartIdClean = cart_id.replace(/_/g, "");
    const txnid = `TXN_${cartIdClean}_${timestamp}`;
    const amount = parseFloat(cart.total).toFixed(2);
    const udf1 = cart_id;

    const hash = this.generateHash(
      txnid,
      amount,
      "SmartCart Purchase",
      cart.mobile || "Customer",
      "customer@smartcart.com",
      udf1
    );

    await CartService.transition(cart_id, user_id, "PAYMENT_PENDING", {
      txnid,
      updated_at: Date.now(),
    });

    const payment = await this.createPaymentRecord({
      cart_id,
      user_id,
      txnid,
      amount,
    });

    return {
      txnid,
      amount,
      hash,
      payment_id: payment.payment_id,
    };
  }

  async finalizeSuccess(cart_id, cart, txnid, amount, payment = null) {
    if (
      (cart.status === "SUCCESS" || cart.status === "CLOSED") &&
      cart.exit_token &&
      cart.invoice_id
    ) {
      return {
        exit_token: cart.exit_token,
        invoice_id: cart.invoice_id,
        cart_id,
      };
    }

    const exit_token = `EXIT_${cart_id}_${txnid}_${Date.now()}`;

    await CartService.transition(cart_id, cart.user_id, "SUCCESS", {
      paid: true,
      paid_amount: parseFloat(amount),
      exit_token,
      exit_used: false,
      txnid,
      lock_start: null,
      lock_duration: null,
      updated_at: Date.now(),
    });

    const latestCart = await CartService.getCart(cart_id, cart.user_id);

    const invoice_id = await InvoiceService.generate(
      cart_id,
      latestCart,
      txnid,
      amount,
      exit_token
    );

    await db.ref(`exit_passes/${exit_token}`).set({
      cart_id,
      user_id: cart.user_id,
      mobile: cart.mobile,
      total_paid: parseFloat(amount),
      invoice_id,
      used: false,
      created_at: Date.now(),
    });

    await CartService.transition(cart_id, cart.user_id, "CLOSED", {
      invoice_id,
      updated_at: Date.now(),
    });

    if (payment?.payment_id) {
      await db.ref(`payments/${payment.payment_id}`).update({
        status: "SUCCESS",
        verified_at: Date.now(),
        invoice_id,
        exit_token,
        updated_at: Date.now(),
      });
    } else {
      const existingPayment = await this.findPaymentByTxnid(txnid);
      if (existingPayment) {
        await db.ref(`payments/${existingPayment.payment_id}`).update({
          status: "SUCCESS",
          verified_at: Date.now(),
          invoice_id,
          exit_token,
          updated_at: Date.now(),
        });
      }
    }

    // await db.ref(`users/${cart.user_id}`).update({
    //   active_cart: null,
    //   updated_at: Date.now(),
    // });

    return { exit_token, invoice_id, cart_id };
  }

  async finalizeFailure(cart_id, cart, txnid, payment = null) {
    if (cart.status === "ACTIVE") {
      return { restored: true };
    }

    if (cart.status === "PAYMENT_PENDING") {
      await CartService.transition(cart_id, cart.user_id, "FAILED", {
        updated_at: Date.now(),
      });
    }

    await CartService.restoreCartToActive(cart_id, cart.user_id, cart);

    if (payment?.payment_id) {
      await db.ref(`payments/${payment.payment_id}`).update({
        status: "FAILED",
        verified_at: Date.now(),
        updated_at: Date.now(),
      });
    } else {
      const existingPayment = await this.findPaymentByTxnid(txnid);
      if (existingPayment) {
        await db.ref(`payments/${existingPayment.payment_id}`).update({
          status: "FAILED",
          verified_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    }

    return { restored: true };
  }

  async processWebhook(fields) {
    const { txnid, status, amount, udf1: cart_id } = fields;

    if (!txnid || !status || !amount || !cart_id) {
      throw { code: 400, message: "Missing required webhook fields" };
    }

    if (!this.verifyHash(fields)) {
      throw { code: 400, message: "Hash verification failed" };
    }

    const payment = await this.findPaymentByTxnid(txnid);
    const snap = await db.ref(`carts/${cart_id}`).once("value");
    const cart = snap.val();

    if (!cart) {
      throw { code: 404, message: "Cart not found" };
    }

    if (payment?.status === "SUCCESS" && cart.exit_token && cart.invoice_id) {
      return {
        exit_token: cart.exit_token,
        invoice_id: cart.invoice_id,
        cart_id,
        repeated: true,
      };
    }

    if (cart.status !== "PAYMENT_PENDING") {
      if (cart.status === "CLOSED" && cart.exit_token && cart.invoice_id) {
        return {
          exit_token: cart.exit_token,
          invoice_id: cart.invoice_id,
          cart_id,
          repeated: true,
        };
      }

      throw { code: 400, message: `Unexpected cart state: ${cart.status}` };
    }

    if (TimerService.isExpired(cart.lock_start, cart.lock_duration)) {
      await CartService.handleExpiry(cart_id, cart.user_id);
      throw { code: 410, message: "Payment window expired" };
    }

    try {
      this.verifyPaymentAmount(cart, amount);
    } catch (err) {
      await db.ref(`carts/${cart_id}`).update({
        payment_issue: true,
        paid_amount: parseFloat(amount),
        updated_at: Date.now(),
      });
      throw err;
    }

    if (String(status).toLowerCase() === "success") {
      return this.finalizeSuccess(cart_id, cart, txnid, amount, payment);
    }

    return this.finalizeFailure(cart_id, cart, txnid, payment);
  }

  async simulateSuccess(cart_id, user_id) {
    const cart = await CartService.getCart(cart_id, user_id);

    if (cart.status !== "PAYMENT_PENDING" && cart.status !== "LOCKED") {
      throw {
        code: 400,
        message: `Cart not ready for payment. Current: ${cart.status}`,
      };
    }

    if (TimerService.isExpired(cart.lock_start, cart.lock_duration)) {
      await CartService.handleExpiry(cart_id, user_id);
      throw {
        code: 410,
        message: "Payment window expired. Cart restored. Please try again.",
      };
    }

    if (cart.status === "LOCKED") {
      await CartService.transition(cart_id, user_id, "PAYMENT_PENDING", {
        txnid: cart.txnid || `SIM_TXN_${Date.now()}`,
        updated_at: Date.now(),
      });
    }

    const latestCart = await CartService.getCart(cart_id, user_id);
    const txnid = latestCart.txnid || `SIM_TXN_${Date.now()}`;
    const amount = parseFloat(latestCart.total).toFixed(2);

    let payment = await this.findPaymentByTxnid(txnid);

    if (!payment) {
      payment = await this.createPaymentRecord({
        cart_id,
        user_id,
        txnid,
        amount,
      });
    }

    return this.finalizeSuccess(cart_id, latestCart, txnid, amount, payment);
  }
}

module.exports = new PaymentService();