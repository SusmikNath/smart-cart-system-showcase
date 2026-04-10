const crypto = require("crypto");
const db = require("../firebase");
const WeightService = require("./WeightService");

// Time Constants
const EMPTY_CART_WARNING_1_MS = 8 * 60 * 1000;  // 8 minutes
const EMPTY_CART_WARNING_2_MS = 5 * 60 * 1000; // 13 minutes
const EMPTY_CART_FINAL_MS = 5 * 60 * 1000;     // 18 minutes
const EMPTY_CART_RELEASE_MS = 2 * 60 * 1000;   // 20 minutes
const LOCK_DURATION = 5 * 60 * 1000;

const TRANSITIONS = {
  ACTIVE: ["LOCKED"],
  LOCKED: ["PAYMENT_PENDING", "ACTIVE", "EXPIRED"],
  PAYMENT_PENDING: ["SUCCESS", "FAILED", "EXPIRED"],
  SUCCESS: ["CLOSED"],
  FAILED: ["ACTIVE"],
  EXPIRED: ["ACTIVE"],
  CLOSED: ["ACTIVE"],
};

class CartService {
  getDefaultCartPassword(cart_id) {
    const map = {
      CART_001: "SNG001X",
      CART_002: "SNG002X",
      CART_003: "SNG003X",
      CART_004: "SNG004X",
      CART_005: "SNG005X",
      CART_006: "SNG006X",
      CART_007: "SNG007X",
      CART_008: "SNG008X",
      CART_009: "SNG009X",
      CART_010: "SNG010X",
      CART_011: "SNG011X",
      CART_012: "SNG012X",
    };

    return map[cart_id] || "DEMO123";
  }

  async getCart(cart_id, user_id = null) {
    const snap = await db.ref(`carts/${cart_id}`).once("value");

    if (!snap.exists()) {
      throw { code: 404, message: "Cart not found" };
    }

    const cart = snap.val();

    if (user_id && cart.user_id && cart.user_id !== user_id) {
      throw { code: 403, message: "Access denied. This is not your cart." };
    }

    return cart;
  }

  async transition(cart_id, user_id, newState, extraData = {}) {
    const cart = await this.getCart(cart_id, user_id);
    const currentState = cart.status || "ACTIVE";
    const allowed = TRANSITIONS[currentState] || [];

    if (!allowed.includes(newState)) {
      throw {
        code: 400,
        message: `Invalid transition: ${currentState} → ${newState}`,
      };
    }

    const updatePayload = {
      status: newState,
      updated_at: Date.now(),
      ...extraData,
    };

    await db.ref(`carts/${cart_id}`).update(updatePayload);

    return {
      ...cart,
      ...updatePayload,
    };
  }

  generateItemKey() {
    return `item_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }

  normalizeItems(items) {
    return items && typeof items === "object" ? items : {};
  }

  calculateTotal(items) {
    return Object.values(this.normalizeItems(items)).reduce((sum, item) => {
      return sum + Number(item.price || 0);
    }, 0);
  }

  calculateExpectedWeight(items) {
    return Object.values(this.normalizeItems(items)).reduce((sum, item) => {
      return sum + Number(item.weight || 0);
    }, 0);
  }

  calculateWeightStatus(expected_weight, actual_weight) {
    return WeightService.check(
      Number(expected_weight || 0),
      Number(actual_weight || 0)
    );
  }

  buildFreshCartData(user_id, mobile, extra = {}) {
    return {
      user_id,
      mobile,
      status: "ACTIVE",
      items: {},
      total: 0,
      paid: false,
      expected_weight: 0,
      actual_weight: 0,
      weight_status: "OK",
      exit_token: null,
      exit_used: false,
      invoice_id: null,
      txnid: null,
      items_backup: null,
      lock_start: null,
      lock_duration: null,
      payment_issue: false,
      paid_amount: null,
      session_started_at: Date.now(),
      last_activity_at: Date.now(),
      empty_cart_warning_stage: 0,
      empty_cart_release_at: null,
      updated_at: Date.now(),
      ...extra,
    };
  }

  async startSession(cart_id, user_id, mobile, cart_password) {
    const expectedPassword = this.getDefaultCartPassword(cart_id);

    if (String(cart_password || "").trim() !== expectedPassword) {
      throw {
        code: 401,
        message: "Invalid cart password",
      };
    }

    const ref = db.ref(`carts/${cart_id}`);
    const snap = await ref.once("value");
    const userRef = db.ref(`users/${user_id}`);
    const userSnap = await userRef.once("value");
    const user = userSnap.val() || {};
    let activeCart = user.active_cart || null;
    const now = Date.now();

    if (activeCart) {
      const activeCartSnap = await db.ref(`carts/${activeCart}`).once("value");
      if (!activeCartSnap.exists()) {
        await userRef.update({ active_cart: null, updated_at: now });
        activeCart = null;
      } else {
        const activeCartData = activeCartSnap.val();
        if (activeCartData.user_id !== user_id) {
          await userRef.update({ active_cart: null, updated_at: now });
          activeCart = null;
        }
      }
    }

    if (activeCart && activeCart !== cart_id) {
      throw {
        code: 400,
        message: `You already have an active cart: ${activeCart}`,
      };
    }

    if (!snap.exists()) {
      await ref.set(
        this.buildFreshCartData(user_id, mobile, {
          created_at: now,
          updated_at: now,
        })
      );
    } else {
      const existing = snap.val();
      const status = existing.status || "ACTIVE";
      const hasItems = !!(existing.items && Object.keys(existing.items).length > 0);
      const belongsToOtherUser = existing.user_id && existing.user_id !== user_id;

      if (belongsToOtherUser) {
        throw { code: 403, message: "Cart already belongs to another user" };
      }

      const shouldResetForReuse =
        status === "SUCCESS" ||
        status === "CLOSED" ||
        existing.paid === true ||
        (!!existing.exit_token && !hasItems);

      if (shouldResetForReuse) {
        await ref.update(
          this.buildFreshCartData(user_id, mobile, {
            created_at: existing.created_at || now,
            updated_at: now,
          })
        );
      } else {
        await ref.update({
          user_id,
          mobile,
          session_started_at: now,
          last_activity_at: now,
          empty_cart_warning_stage: 0,
          empty_cart_release_at: null,
          updated_at: now,
        });
      }
    }

    await userRef.update({
      active_cart: cart_id,
      updated_at: now,
    });

    return this.getCart(cart_id, user_id);
  }

  async addItem(cart_id, user_id, item) {
    const cart = await this.getCart(cart_id, user_id);

    if (cart.status !== "ACTIVE") {
      throw {
        code: 403,
        message: `Cannot scan. Cart is in ${cart.status} state.`,
      };
    }

    const items = this.normalizeItems(cart.items);
    const itemKey = this.generateItemKey();

    items[itemKey] = {
      rfid: item.rfid,
      barcode: item.barcode || null,
      name: item.name,
      price: Number(item.price || 0),
      category: item.category || "General",
      weight: Number(item.weight || 0),
      scanned_at: item.scanned_at || Date.now(),
      scan_type: item.scan_type || "RFID",
    };

    const total = this.calculateTotal(items);
    const expected_weight = this.calculateExpectedWeight(items);
    const actual_weight = Number(cart.actual_weight || 0);
    const weightCheck = this.calculateWeightStatus(expected_weight, actual_weight);

    await db.ref(`carts/${cart_id}`).update({
      items,
      total,
      expected_weight,
      actual_weight,
      weight_status: weightCheck.status,
      last_activity_at: Date.now(),
      empty_cart_warning_stage: 0,
      empty_cart_release_at: null,
      updated_at: Date.now(),
    });

    return {
      added_item: items[itemKey],
      total,
      expected_weight,
      actual_weight,
      weight_status: weightCheck.status,
      item_count: Object.keys(items).length,
    };
  }

  async removeItem(cart_id, user_id, item_key) {
    const cart = await this.getCart(cart_id, user_id);

    if (cart.status !== "ACTIVE") {
      throw {
        code: 403,
        message: `Cannot remove item. Cart is in ${cart.status} state.`,
      };
    }

    const items = this.normalizeItems(cart.items);

    if (!items[item_key]) {
      throw {
        code: 404,
        message: "Item not found in cart",
      };
    }

    delete items[item_key];

    const total = this.calculateTotal(items);
    const expected_weight = this.calculateExpectedWeight(items);
    const actual_weight = Number(cart.actual_weight || 0);
    const weightCheck = this.calculateWeightStatus(expected_weight, actual_weight);

    await db.ref(`carts/${cart_id}`).update({
      items,
      total,
      expected_weight,
      actual_weight,
      weight_status: weightCheck.status,
      updated_at: Date.now(),
    });

    return {
      removed_item_key: item_key,
      total,
      expected_weight,
      actual_weight,
      weight_status: weightCheck.status,
      item_count: Object.keys(items).length,
    };
  }

  async getEmptyCartStatus(cart_id, user_id) {
    const cart = await this.getCart(cart_id, user_id);
    const items = cart.items || {};
    const itemCount = Object.keys(items).length;

    if (cart.status !== "ACTIVE") {
      return {
        active: false,
        stage: 0,
        should_release: false,
        remaining_ms: 0,
        message: null,
      };
    }

    if (itemCount > 0) {
      return {
        active: false,
        stage: 0,
        should_release: false,
        remaining_ms: 0,
        message: null,
      };
    }

    const baseTime = cart.last_activity_at || cart.session_started_at || cart.created_at || Date.now();
    const elapsed = Date.now() - baseTime;

    let stage = 0;
    let message = null;
    let remaining_ms = 0;

    if (elapsed >= EMPTY_CART_RELEASE_MS) {
      return {
        active: true,
        stage: 4,
        should_release: true,
        remaining_ms: 0,
        message: "Cart released due to inactivity.",
      };
    }

    if (elapsed >= EMPTY_CART_FINAL_MS) {
      stage = 3;
      remaining_ms = EMPTY_CART_RELEASE_MS - elapsed;
      message = "Your cart is still empty. Add an item within 2 minutes or it will be released.";
    } else if (elapsed >= EMPTY_CART_WARNING_2_MS) {
      stage = 2;
      remaining_ms = EMPTY_CART_RELEASE_MS - elapsed;
      message = "Still shopping? Please add an item soon to keep this cart.";
    } else if (elapsed >= EMPTY_CART_WARNING_1_MS) {
      stage = 1;
      remaining_ms = EMPTY_CART_RELEASE_MS - elapsed;
      message = "Are you still shopping? Your cart is empty.";
    }

    return {
      active: stage > 0,
      stage,
      should_release: false,
      remaining_ms,
      message,
    };
  }

  async forceReleaseEmptyCart(cart_id, user_id) {
    const cart = await this.getCart(cart_id, user_id);
    const items = cart.items || {};
    const itemCount = Object.keys(items).length;

    if (cart.status !== "ACTIVE") {
      throw {
        code: 400,
        message: `Cannot auto-release cart in ${cart.status} state`,
      };
    }

    if (itemCount > 0) {
      throw {
        code: 400,
        message: "Cart is no longer empty",
      };
    }

    await db.ref(`carts/${cart_id}`).update({
      user_id: null,
      mobile: null,
      session_started_at: null,
      last_activity_at: null,
      empty_cart_warning_stage: 0,
      empty_cart_release_at: null,
      updated_at: Date.now(),
    });

    await db.ref(`users/${user_id}`).update({
      active_cart: null,
      updated_at: Date.now(),
    });

    return {
      released: true,
      cart_id,
    };
  }

  async lockCart(cart_id, user_id) {
    const cart = await this.getCart(cart_id, user_id);
    const items = this.normalizeItems(cart.items);

    if (!Object.keys(items).length) {
      throw { code: 400, message: "Cannot checkout empty cart" };
    }

    if (cart.weight_status === "MISMATCH") {
      throw {
        code: 400,
        message: "Weight mismatch detected. Please verify cart items first.",
      };
    }

    const lock_start = Date.now();

    return this.transition(cart_id, user_id, "LOCKED", {
      lock_start,
      lock_duration: LOCK_DURATION,
      items_backup: items,
    });
  }

  async getRemainingTime(cart_id, user_id) {
    const cart = await this.getCart(cart_id, user_id);

    if (cart.status !== "LOCKED" && cart.status !== "PAYMENT_PENDING") {
      return { remaining: 0, expired: true };
    }

    const elapsed = Date.now() - Number(cart.lock_start || 0);
    const remaining = Math.max(0, Number(cart.lock_duration || 0) - elapsed);

    return {
      remaining,
      expired: remaining === 0,
    };
  }

  async restoreCartToActive(cart_id, user_id, cart) {
    const restoredItems = cart.items_backup || cart.items || {};
    const restoredTotal = this.calculateTotal(restoredItems);
    const restoredExpectedWeight = this.calculateExpectedWeight(restoredItems);
    const actual_weight = Number(cart.actual_weight || 0);
    const weightCheck = this.calculateWeightStatus(restoredExpectedWeight, actual_weight);

    await db.ref(`carts/${cart_id}`).update({
      status: "ACTIVE",
      items: restoredItems,
      total: restoredTotal,
      expected_weight: restoredExpectedWeight,
      actual_weight,
      weight_status: weightCheck.status,
      paid: false,
      exit_token: null,
      exit_used: false,
      invoice_id: null,
      txnid: null,
      items_backup: null,
      lock_start: null,
      lock_duration: null,
      payment_issue: false,
      paid_amount: null,
      updated_at: Date.now(),
    });

    return this.getCart(cart_id, user_id);
  }

  async cancelCheckout(cart_id, user_id) {
    const cart = await this.getCart(cart_id, user_id);

    if (cart.status !== "LOCKED" && cart.status !== "PAYMENT_PENDING") {
      throw {
        code: 400,
        message: `Cannot cancel checkout in ${cart.status} state`,
      };
    }

    const restoredItems = cart.items_backup || cart.items || {};
    const restoredTotal = this.calculateTotal(restoredItems);
    const restoredExpectedWeight = this.calculateExpectedWeight(restoredItems);
    const actual_weight = Number(cart.actual_weight || 0);
    const weightCheck = this.calculateWeightStatus(restoredExpectedWeight, actual_weight);

    await db.ref(`carts/${cart_id}`).update({
      status: "ACTIVE",
      items: restoredItems,
      total: restoredTotal,
      expected_weight: restoredExpectedWeight,
      actual_weight,
      weight_status: weightCheck.status,
      paid: false,
      txnid: null,
      items_backup: null,
      lock_start: null,
      lock_duration: null,
      payment_issue: false,
      paid_amount: null,
      updated_at: Date.now(),
    });

    return this.getCart(cart_id, user_id);
  }

  async handleExpiry(cart_id, user_id) {
    const cart = await this.getCart(cart_id, user_id);

    if (cart.status === "ACTIVE") {
      return cart;
    }

    if (cart.status !== "LOCKED" && cart.status !== "PAYMENT_PENDING") {
      throw {
        code: 400,
        message: `Cannot expire cart in ${cart.status} state`,
      };
    }

    await this.transition(cart_id, user_id, "EXPIRED", {
      updated_at: Date.now(),
    });

    return this.restoreCartToActive(cart_id, user_id, cart);
  }

  async createNewCart(user_id, mobile) {
    const new_cart_id = `CART_${user_id}_${Date.now()}`;
    const now = Date.now();

    await db.ref(`carts/${new_cart_id}`).set(
      this.buildFreshCartData(user_id, mobile, {
        created_at: now,
        updated_at: now,
      })
    );

    await db.ref(`users/${user_id}`).update({
      active_cart: new_cart_id,
      updated_at: now,
    });

    return new_cart_id;
  }
}

module.exports = new CartService();