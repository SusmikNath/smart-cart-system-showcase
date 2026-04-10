const devices = {
  CART_001_DEV: {
    cart_id: "CART_001",
    secret: process.env.DEVICE_SECRET_CART_001,
    enabled: process.env.DEVICE_ENABLED_CART_001 !== "false",
  },
};

module.exports = (req, res, next) => {
  const device_id = String(req.header("x-device-id") || "").trim();
  const device_secret = String(req.header("x-device-secret") || "").trim();

  if (!device_id || !device_secret) {
    return res.status(401).json({
      success: false,
      message: "Missing device credentials",
    });
  }

  const device = devices[device_id];

  if (!device || !device.enabled || !device.secret) {
    return res.status(401).json({
      success: false,
      message: "Unknown or disabled device",
    });
  }

  if (device.secret !== device_secret) {
    return res.status(401).json({
      success: false,
      message: "Invalid device secret",
    });
  }

  req.device = {
    device_id,
    cart_id: device.cart_id,
  };

  next();
};