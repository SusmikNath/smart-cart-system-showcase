const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const db = require("../firebase");

class InvoiceService {
  async generate(cart_id, cart, txnid, amount, exit_token) {
    const invoice_id = `INV_${cart_id}_${Date.now()}`;
    const filename = `${invoice_id}.pdf`;
    const invoicesDir = path.join(__dirname, "../invoices");
    const filepath = path.join(invoicesDir, filename);
    const items = cart.items ? Object.values(cart.items) : [];
    const dateStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    fs.mkdirSync(invoicesDir, { recursive: true });

    const qrDataUrl = await QRCode.toDataURL(exit_token);
    const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      doc.fontSize(24).fillColor("#00e676").text("SCAN-N-GO", { align: "center" });
      doc.fontSize(10).fillColor("#666").text("Smart Shopping Receipt", { align: "center" });
      doc.moveDown();

      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ddd");
      doc.moveDown();

      doc.fontSize(10).fillColor("#333");
      doc.text(`Invoice ID  : ${invoice_id}`);
      doc.text(`Transaction : ${txnid}`);
      doc.text(`Cart ID     : ${cart_id}`);
      doc.text(`Date & Time : ${dateStr}`);
      doc.text(`Status      : PAID`);
      doc.moveDown();

      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ddd");
      doc.moveDown(0.5);

      doc.fontSize(10).fillColor("#000");
      const headerY = doc.y;
      doc.text("Item", 50, headerY, { width: 250 });
      doc.text("Qty", 300, headerY, { width: 60, align: "center" });
      doc.text("Price", 360, headerY, { width: 80, align: "right" });
      doc.text("Subtotal", 440, headerY, { width: 100, align: "right" });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ddd");
      doc.moveDown(0.5);

      const grouped = {};
      items.forEach((item) => {
        if (grouped[item.name]) {
          grouped[item.name].qty++;
          grouped[item.name].subtotal += Number(item.price);
        } else {
          grouped[item.name] = {
            price: Number(item.price),
            qty: 1,
            subtotal: Number(item.price),
          };
        }
      });

      Object.entries(grouped).forEach(([name, data]) => {
        const y = doc.y;
        doc.fontSize(9).fillColor("#333");
        doc.text(name, 50, y, { width: 250 });
        doc.text(String(data.qty), 300, y, { width: 60, align: "center" });
        doc.text(`₹${data.price}`, 360, y, { width: 80, align: "right" });
        doc.text(`₹${data.subtotal}`, 440, y, { width: 100, align: "right" });
        doc.moveDown(0.7);
      });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ddd");
      doc.moveDown();

      doc.fontSize(14).fillColor("#000").text(`TOTAL PAID: ₹${amount}`, { align: "right" });
      doc.moveDown();

      doc.fontSize(10).fillColor("#666").text("Exit Pass QR Code:", { align: "center" });
      doc.image(qrBuffer, { fit: [100, 100], align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor("#999").text(exit_token, { align: "center" });

      doc.end();

      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    await db.ref(`invoices/${invoice_id}`).set({
      cart_id,
      user_id: cart.user_id,
      txnid,
      amount: parseFloat(amount),
      items,
      pdf_path: `invoices/${filename}`,
      created_at: Date.now(),
    });

    await db.ref(`carts/${cart_id}`).update({ invoice_id });

    return invoice_id;
  }
}

module.exports = new InvoiceService();