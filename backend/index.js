const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const cartRoutes = require("./routes/cart");
const deviceRoutes = require("./routes/device");
const paymentRoutes = require("./routes/payment");
const exitRoutes = require("./routes/exit");
const scannerRoutes = require("./routes/scanner");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - startedAt;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`
    );
  });

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

app.use("/auth", authRoutes);
app.use("/cart", cartRoutes);
app.use("/payment", paymentRoutes);
app.use("/scanner", scannerRoutes);
app.use("/api", exitRoutes);
app.use("/device", deviceRoutes);


app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "OK",
    project: "Scan-N-Go Smart Cart",
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route '${req.method} ${req.path}' not found.`,
  });
});

app.use((err, req, res, next) => {
  console.error("[ERROR]", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.code || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Scan-N-Go backend running on http://localhost:${PORT}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/health`);
});