class ProductService {
  constructor() {
    this.products = {
      "21C2DAAD": {
        rfid: "21C2DAAD",
        barcode: "890100000001",
        name: "Milk",
        price: 30,
        category: "Dairy",
        weight: 250
      },
      "AD117005": {
        rfid: "AD117005",
        barcode: "890100000002",
        name: "Bread",
        price: 25,
        category: "Bakery",
        weight: 300
      },
      "253BA904": {
        rfid: "253BA904",
        barcode: "890100000003",
        name: "Rice",
        price: 60,
        category: "Groceries",
        weight: 500
      },
      "M4N5O6": {
        rfid: "M4N5O6",
        barcode: "890100000004",
        name: "Soap",
        price: 40,
        category: "Personal Care",
        weight: 120
      },
      "P1Q2R3": {
        rfid: "P1Q2R3",
        barcode: "890100000005",
        name: "Biscuits",
        price: 20,
        category: "Snacks",
        weight: 80
      },
      "S4T5U6": {
        rfid: "S4T5U6",
        barcode: "890100000006",
        name: "Juice",
        price: 35,
        category: "Beverages",
        weight: 250
      }
    };
  }

  getByRfid(rfid) {
    const cleanRfid = String(rfid || "").trim().toUpperCase();
    return this.products[cleanRfid] || null;
  }

  getByBarcode(barcode) {
    const cleanBarcode = String(barcode || "").trim();

    return Object.values(this.products).find(
      (product) => String(product.barcode) === cleanBarcode
    ) || null;
  }

  getAll() {
    return Object.values(this.products);
  }
}

module.exports = new ProductService();